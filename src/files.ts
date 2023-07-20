import '@fluencelabs/js-client.node'; // Import the JS Client implementation. Don't forget to add this import!
import { Fluence } from '@fluencelabs/js-client.api'; // Import the API for JS Client
import { remove, registerFileSystem, registerIpfsClient, upload_string, id as showPeerId } from './_aqua/files.js'; // Aqua compiler provides functions which can be directly imported like any normal TypeScript function.
import { readdir, readFile } from 'node:fs/promises';
import { createHelia } from 'helia';
import { strings } from '@helia/strings';
import { CID } from 'multiformats/cid';
import { bootstrap } from '@libp2p/bootstrap'
import { setTimeout } from 'node:timers';
import { dagJson } from '@helia/dag-json';
import { randomTestNet } from '@fluencelabs/fluence-network-environment';
import { FsBlockstore } from 'blockstore-fs';
import { FsDatastore } from 'datastore-fs'

const MINUTE = 60000;

const timeout = async <T,>(promise: Promise<T>, timeout: number): Promise<T> => {
    const timerPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Timeout")), timeout).unref();
    });

    return await Promise.race([promise, timerPromise]);
};

const blockstore = new FsBlockstore('./temp/store');
const datastore = new FsDatastore('./temp/data');

const createHeliaFromMultiaddr = async (multiaddr: string) => {
    return await createHelia({
        libp2p: {
            peerDiscovery: [bootstrap({
                list: [multiaddr]
            })]
        },
        blockstore,
        datastore,
        holdGcLock: false
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
                console.log('Remove pinned entry:', c.toString());
                const pin = await helia.pins.rm(c);
                await helia.gc();
            }

            await helia.stop();
            return c.toString();
        },
        async upload(multiaddr: string, path: string) {
            const helia = await createHeliaFromMultiaddr(multiaddr);

            const s = strings(helia);

            const buffer = await readFile(path);

            const cid = await timeout(s.add(buffer.toString()), MINUTE);
            await helia.pins.add(cid);

            await helia.stop();
            return cid.toString();
        },
        async upload_string(multiaddr: string, contents: string) {
            const helia = await createHeliaFromMultiaddr(multiaddr);

            const s = strings(helia);

            const cid = await timeout(s.add(contents), MINUTE);
            await helia.pins.add(cid);

            await helia.stop();
            return cid.toString();
        },
        async dag_upload(multiaddr: string, path: string) {
            const helia = await createHeliaFromMultiaddr(multiaddr);

            const dj = dagJson(helia);

            const buffer = await readFile(path);

            const cid = await timeout(dj.add(buffer.toString()), MINUTE)
            await helia.pins.add(cid);

            await helia.stop();
            return cid.toString();
        },
        async dag_upload_string(multiaddr: string, contents: string) {
            const helia = await createHeliaFromMultiaddr(multiaddr);

            const dj = dagJson(helia);

            const cid = await timeout(dj.add(contents), MINUTE);
            await helia.pins.add(cid);

            await helia.stop();
            return cid.toString();
        }
    });

    const cid = await upload_string("/dnsaddr/node-1.ingress.cloudflare-ipfs.com/p2p/QmcFf2FH3CEgTNHeMRGhN7HNHU1EXAxoEk6EFuSyXCsvRE", "Hello world!!!", {
        ttl: 9999999
    });

    console.log('cid:', cid.toString());

    const id = await showPeerId("/dnsaddr/node-1.ingress.cloudflare-ipfs.com/p2p/QmcFf2FH3CEgTNHeMRGhN7HNHU1EXAxoEk6EFuSyXCsvRE");
    console.log('Peer id:', id);

    await remove("/dnsaddr/node-1.ingress.cloudflare-ipfs.com/p2p/QmcFf2FH3CEgTNHeMRGhN7HNHU1EXAxoEk6EFuSyXCsvRE", "bafkreicdktp5u4gi6djzsg454pkw3s3ot4x4nqbrnurvwy5p5m4ii4nnuq", {
        ttl: 9999999
    });

    await Fluence.disconnect();
}

main();