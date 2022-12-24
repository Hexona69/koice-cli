import { ArgumentParser } from 'argparse';
import koice from 'koice';
import { PassThrough, Stream } from 'stream';
import * as fs from 'fs';
import * as readline from 'readline/promises';
import delay from 'delay';
import ffmpeg from 'fluent-ffmpeg';

process.argv[1] = "koice";

const parser = new ArgumentParser({
    description: 'Stream local audio file to a KOOK voice channel, without the need rejoin the channel when switching songs',
    epilog: 'Have fun streaming'
});

parser.add_argument('token', {
    help: 'Your KOOK bot token',
    type: 'str'
})

parser.add_argument('channel', {
    help: 'The voice channel to stream audio to',
    type: 'str'
})

parser.add_argument('-i', '--input', {
    help: 'The path to a local file to start streaming with',
    type: 'str'
})

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

var paused: boolean = false;
var queue: string[] = [];

(async () => {
    const voice = new koice(args.token);

    voice.connectWebSocket(args.channel);

    await voice.startStream(stream);

    console.log(`Connected to channel ${args.channel} as ${args.token}`);

    var skipOnce = false;
    if (args.input) {
        skipOnce = true;
        input = args.input
        console.log('Enter the path to a new audio file to switch song');
    } else {
        console.log('Enter the path to a audio file to start streaming')
    }

    const rl = readline.createInterface(process.stdin, process.stdout);
    while (true) {
        if (skipOnce) skipOnce = false;
        else input = await rl.question('')
        if (fs.existsSync(input)) {
            if (previousStream) {
                queue.push(input);
                console.log(`Added ${input} to queue`);
            } else {
                await playback(input);
            }
        } else {
            switch (input.toLowerCase()) {
                case 'skip':
                    await next();
                    break;
                case 'pause':
                    console.log("Stream paused");
                    paused = true;
                    break;
                case 'resume':
                    console.log("Stream resumed");
                    paused = false;
                    break;
                case 'queue':
                    console.log('Queue:\n    ' + queue.join('\n    '));
                    break;
                default:
                    console.log(`Cannot recognize file or command "${input}"`);
                    break;
            }
        }
    }
})()

async function next() {
    if (queue.length) {
        const nextup = queue.shift();
        console.log("Next up: " + nextup);
        if (nextup) await playback(nextup);
    } else {
        console.log('Queue is empty!');
    }
}

async function playback(file: string) {
    // console.log(file);
    if (previousStream) {
        console.log(`Stopping prevoius stream...`);
        previousStream = false;
        await delay(200);
        ffmpegInstance?.kill("SIGSTOP");
        fileP?.removeAllListeners();
        fileP?.destroy();
        await delay(900);
        fileP = new PassThrough();
        // return;
    }

    // console.log(444444);
    // console.log(5555555);
    previousStream = true;
    var fileC = fs.createReadStream(file);
    // fileP = fs.createReadStream(file);
    console.log(`Transcoding "${file}"`);
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
    await delay(200);
    var bytes = 0;
    var bfs: any[] = [];
    fileP.on('data', (chunk) => {
        bfs.push(chunk)
    })
    fileP.on('end', async () => {
        var now = 0;
        var buffer = Buffer.concat(bfs);
        // var rate = 11025;
        var rate = 24000;
        while (Date.now() - lastRead < 2000);
        console.log(`Start streaming: "${file}"`);
        while (previousStream && now <= buffer.length) {
            if (!paused) {
                lastRead = Date.now();
                const chunk = buffer.subarray(now, now + rate);
                // console.log(file);
                // console.log(chunk);
                if (previousStream && now <= buffer.length) {
                    stream.push(chunk);
                }
                else {
                    return;
                }
                now += rate;
            }
            await delay(250);
        }
        console.log("Stream ended");
        if (previousStream) {
            await next();
        }
    });
}