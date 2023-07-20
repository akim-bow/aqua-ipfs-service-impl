import '@fluencelabs/js-client.node'; // Import the JS Client implementation. Don't forget to add this import!
import { Fluence } from '@fluencelabs/js-client.api'; // Import the API for JS Client
import { exists, registerFileSystem, registerIpfsClient } from './_aqua/files.js'; // Aqua compiler provides functions which can be directly imported like any normal TypeScript function.
import { readdir, readFile } from 'node:fs/promises';
import { createHelia } from 'helia';
import { strings } from '@helia/strings';
import { CID } from 'multiformats/cid';
import { bootstrap } from '@libp2p/bootstrap'
import { setTimeout } from 'node:timers';
import { dagJson } from '@helia/dag-json';
import { randomTestNet } from '@fluencelabs/fluence-network-environment';

const MINUTE = 60000;

const timeout = async <T,>(promise: Promise<T>, _timeout: number): Promise<T> => {
    const timerPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Timeout")), _timeout).unref();
    });

    return await Promise.race([promise, timerPromise]);
};


const createHeliaFromMultiaddr = async (multiaddr: string) => {
    return await createHelia({
        libp2p: {
            peerDiscovery: [bootstrap({
                list: [multiaddr]
            })]
        }
    });
}

async function main() {
    await Fluence.connect(randomTestNet());

    registerFileSystem({
        async list(dir: string) {
            const files = await readdir(dir);
            return files;
        },
        async list_ext(dir: string, ext: string) {
            const files = await readdir(dir);
            return files.filter(file => file.endsWith(ext))
        }
    });

    registerIpfsClient({
        async exists(multiaddr: string, cid: string) {
            const helia = await createHeliaFromMultiaddr(multiaddr);

            const s = strings(helia);

            const c = CID.parse(cid);

            const content = await timeout(s.get(c), MINUTE);


            const result = Boolean(content);
            await helia.stop();
            return result;
        },
        async id(multiaddr: string) {
            const helia = await createHeliaFromMultiaddr(multiaddr);

            const id = await timeout(new Promise<string>(resolve => {
                helia.libp2p.addEventListener('peer:discovery', event => {
                    resolve(event.detail.id.toString());
                })
            }), MINUTE);
            await helia.stop();
            return id;
        },
        async remove(multiaddr: string, cid: string) {
            const helia = await createHeliaFromMultiaddr(multiaddr);

            const c = CID.parse(cid);

            const isPinned = await helia.pins.isPinned(c);
            if (isPinned) {
                const pin = await helia.pins.rm(c);
            }

            await helia.stop();
            return c.toString();
        },
        async upload(multiaddr: string, path: string) {
            const helia = await createHeliaFromMultiaddr(multiaddr);

            const s = strings(helia);

            const buffer = await readFile(path);

            const cid = await timeout(s.add(buffer.toString()), MINUTE);
            await helia.stop();
            return cid.toString();
        },
        async upload_string(multiaddr: string, contents: string) {
            const helia = await createHeliaFromMultiaddr(multiaddr);

            const s = strings(helia);

            const cid = await timeout(s.add(contents), MINUTE);
            await helia.stop();
            return cid.toString();
        },
        async dag_upload(multiaddr: string, path: string) {
            const helia = await createHeliaFromMultiaddr(multiaddr);

            const dj = dagJson(helia);

            const buffer = await readFile(path);

            const cid = await timeout(dj.add(buffer.toString()), MINUTE)
            await helia.stop();
            return cid.toString();
        },
        async dag_upload_string(multiaddr: string, contents: string) {
            const helia = await createHeliaFromMultiaddr(multiaddr);

            const dj = dagJson(helia);

            const cid = await timeout(dj.add(contents), MINUTE);
            await helia.stop();
            return cid.toString();
        }
    });

    const e = await exists("/dnsaddr/node-1.ingress.cloudflare-ipfs.com/p2p/QmcFf2FH3CEgTNHeMRGhN7HNHU1EXAxoEk6EFuSyXCsvRE", "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e", {
        ttl: 9999999
    });
    console.log(e);



    await Fluence.disconnect();
}

main();