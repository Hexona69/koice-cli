import { ArgumentParser } from 'argparse';
import koice from 'koice';
import { PassThrough, Stream } from 'stream';
import * as fs from 'fs';
import * as readline from 'readline/promises';
import delay from 'delay';
import ffmpeg, { ffprobe } from 'fluent-ffmpeg';
import upath from 'upath';

process.argv[1] = "koice";

const parser = new ArgumentParser({
    description: 'Stream local audio file to a KOOK voice channel, without the need rejoin the channel when switching songs',
    epilog: 'Have fun streaming'
});

parser.add_argument('-t', '--token', {
    help: 'Your KOOK bot token',
    type: 'str'
})

parser.add_argument('-c', '--channel', {
    help: 'The voice channel to stream audio to',
    type: 'str'
})

parser.add_argument('-i', '--input', {
    help: 'The path to a local file to start streaming with',
    type: 'str'
})

const rl = readline.createInterface(process.stdin, process.stdout);

const args = parser.parse_args()

var fileP = new PassThrough();
// var fileP: fs.ReadStream | undefined;
var input: string = "";
var ffmpegInstance: ffmpeg.FfmpegCommand | undefined;


var previousStream: boolean = false;
var lastRead: number = -1;

const stream = new Stream.Readable({
    read(size) {
        return true;
    },
})

function shuffle(array: any[]) {
    let currentIndex = array.length, randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex != 0) {

        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }

    return array;
}

var paused: boolean = false;
var queue: string[] = [];

function write(content: string) {
    process.stdout.cursorTo(0);
    process.stdout.write(content + "\n> ");
}

let isRepeat = false;
(async () => {

    if (!args.token) {
        write("Enter your KOOK bot token");
        args.token = await rl.question('> ');
    }
    if (!args.channel) {
        write("Enter the channel to stream to");
        args.channel = await rl.question('> ');
    }

    const voice = new koice(args.token);

    voice.connectWebSocket(args.channel);

    await voice.startStream(stream);

    write(`Connected to channel ${args.channel} as ${args.token}`);

    var skipOnce = false;
    if (args.input) {
        skipOnce = true;
        input = args.input
        write('Enter the path to a new audio file to add it to queue');
    } else {
        write('Enter the path to a audio file to start streaming')
    }
    write(`Send "help" for command list`);
    while (true) {
        if (skipOnce) skipOnce = false;
        else input = await rl.question('> ')
        const path = input.trim().replace(/^['"](.*)['"]$/, '$1').trim();
        if (fs.existsSync(path)) {
            if (fs.lstatSync(path).isDirectory()) {
                fs.readdirSync(path).forEach((file) => {
                    const fullPath = upath.join(path, file);
                    ffprobe(fullPath, async (err, data) => {
                        if (err) return;
                        if (data.streams.map(val => val.codec_type).includes('audio')) {
                            if (previousStream) {
                                queue.push(fullPath);
                                write(`Added ${fullPath} to queue`);
                            } else {
                                await playback(fullPath);
                            }
                        }
                        // console.log(data.streams.map(val => val.codec_type));
                    })
                })
            } else {
                if (previousStream) {
                    queue.push(path);
                    write(`Added ${path} to queue`);
                } else {
                    await playback(path);
                }
            }
        } else {
            switch (input.toLowerCase()) {
                case 'help':
                    write(`Command List:
    pause                        Pause the stream
    resume                       Resume the stream
    skip                         Skip current file
    repeat                       Repeat current file infinitely
    clear                        Clear queue
    random, suffle               Randomize the queue
    list, queue                  See current queue`);
                    break;
                case 'next':
                case 'skip':
                    await next();
                    break;
                case 'suffle':
                case 'random':
                    write('Suffling queue');
                    queue = shuffle(queue);
                    write('Queue:\n    ' + queue.join('\n    '));
                    break;
                case 'pause':
                    write("Stream paused");
                    paused = true;
                    break;
                case 'resume':
                    write("Stream resumed");
                    paused = false;
                    break;
                case 'clear':
                    write("Queue cleared");
                    queue = [];
                    break;
                case 'list':
                case 'queue':
                    write('Queue:\n    ' + queue.join('\n    '));
                    break;
                case 'exit':
                    process.exit(0);
                case 'repeat':
                    if (isRepeat) {
                        write(`Stop repeat`);
                        isRepeat = false;
                    } else {
                        write(`Start repeat`);
                        isRepeat = true;
                    }
                    break;
                default:
                    write(`Cannot recognize file or command "${input}"`);
                    break;
            }
        }
    }
})()

async function next() {
    if (isRepeat) {
        if (queue.length) await playback(queue[0]);
        else write('Queue is empty!');
    } else {
        queue.shift();
        if (queue.length) {
            const nextup = queue[0];
            write("Next up: " + nextup);
            if (nextup) await playback(nextup);
        } else {
            write('Queue is empty!');
        }
    }
}

async function playback(file: string) {
    // write(file);
    if (previousStream) {
        write(`Stopping prevoius stream...`);
        previousStream = false;
        await delay(20);
        ffmpegInstance?.kill("SIGSTOP");
        fileP?.removeAllListeners();
        fileP?.destroy();
        // await delay(100);
        fileP = new PassThrough();
        // return;
    }

    // write(444444);
    // write(5555555);
    previousStream = true;
    var fileC = fs.createReadStream(file);
    // fileP = fs.createReadStream(file);
    write(`Transcoding "${file}"`);
    ffmpegInstance = ffmpeg()
        .input(fileC)
        .audioCodec('pcm_u8')
        // .audioCodec('libopus')
        // .audioCodec('libmp3lame')
        .audioBitrate(128)
        .audioChannels(2)
        // .audioFrequency(44100)
        .audioFrequency(48000)
        .outputFormat('wav');
    // .outputFormat('mp3');
    // .outputFormat('opus');
    ffmpegInstance
        .stream(fileP)
    // await delay(50);
    var bytes = 0;
    var bfs: any[] = [];
    fileP.on('data', (chunk) => {
        bfs.push(chunk)
    })
    fileP.on('end', async () => {
        var now = 0;
        var buffer = Buffer.concat(bfs);
        // var rate = 11025;
        var rate = 965;
        while (Date.now() - lastRead < 20);
        write(`Start streaming: "${file}"`);
        while (previousStream && now <= buffer.length) {
            if (!paused) {
                lastRead = Date.now();
                const chunk = buffer.subarray(now, now + rate);
                if (previousStream && now <= buffer.length) {
                    stream.push(chunk);
                }
                else {
                    return;
                }
                now += rate;
            }
            await delay(10);
        }
        write("Stream ended");
        if (previousStream) {
            await next();
            previousStream = false;
            await delay(20);
            ffmpegInstance?.kill("SIGSTOP");
            fileP?.removeAllListeners();
            fileP?.destroy();
            // await delay(100);
            fileP = new PassThrough();
            // return;
        }
    });
}