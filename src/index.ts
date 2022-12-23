import { ArgumentParser } from 'argparse';
import koice from 'koice';
import { Stream } from 'stream';
import * as fs from 'fs';
import * as readline from 'readline/promises';
import delay from 'delay';

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

console.log(args);


function printProgress(content: string) {
    process.stdout.cursorTo(0);
    process.stdout.write(content);

    // process.stdout.write(content + '\n');
}

var fileP: fs.ReadStream | undefined;
var input: string = "";

(async () => {
    const voice = new koice(args.token);

    voice.connectWebSocket(args.channel);

    const stream = new Stream.Readable({
        read(size) {
            return true;
        },
    })

    await voice.startStream(stream);

    console.log(`Connected to channel ${args.channel} as ${args.token}`);

    var previousStream: boolean = false;

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
            console.log(input);
            if (previousStream) {
                previousStream = false;
                fileP?.destroy();
                await delay(500);
            }

            // console.log(444444);
            await delay(500);
            // console.log(5555555);
            previousStream = true;
            fileP = fs.createReadStream(input, { highWaterMark: 3 });
            await delay(500);
            fileP.on('data', (chunk) => {
                printProgress(`${input} | ${Date.now()} | ${previousStream}`)
                if (previousStream) {
                    stream.push(chunk);
                } else {
                    stream.push("");
                    fileP?.removeAllListeners();
                }
            })
        }
    }
})()

