const SENDER_FIELD = "__jacdac_sender"
/* eslint-disable @typescript-eslint/no-var-requires */
const WebSocket = require("faye-websocket")
import http from "http"
import https from "https"
import url from "url"
import net from "net"
import fs from "fs"

const log = console.log
const debug = console.debug
const error = console.error

function fetchProxy(localhost: boolean): Promise<string> {
    const protocol = localhost ? http : https
    const url = localhost
        ? "http://localhost:8000/devtools/proxy.html"
        : "https://microsoft.github.io/jacdac-docs/devtools/proxy"
    //debug(`fetch jacdac devtools proxy at ${url}`)
    return new Promise<string>((resolve, reject) => {
        protocol
            .get(url, res => {
                if (res.statusCode != 200)
                    reject(
                        new Error(`proxy download failed (${res.statusCode})`)
                    )
                res.setEncoding("utf8")
                let body = ""
                res.on("data", data => (body += data))
                res.on("end", () => {
                    body = body.replace(
                        /https:\/\/microsoft.github.io\/jacdac-docs\/dashboard/g,
                        localhost
                            ? "http://localhost:8000/devicescript/"
                            : "https://microsoft.github.io/jacdac-docs/editors/devicescript/"
                    )
                    resolve(body)
                })
                res.on("error", reject)
            })
            .on("error", reject)
    })
}

export async function startDevTools(
    bytecodeFile: string,
    options?: {
        internet?: boolean
        localhost?: boolean
    }
) {
    const { internet, localhost } = options || {}
    const port = 8081
    const tcpPort = 8082
    const listenHost = internet ? undefined : "127.0.0.1"

    log(`start dev tools for ${bytecodeFile}`)
    log(`   dashboard: http://localhost:${port}`)
    log(`   websocket: ws://localhost:${port}`)
    log(`   tcpsocket: tcp://localhost:${tcpPort}`)

    // download proxy sources
    const proxyHtml = await fetchProxy(localhost)

    // start http server
    const clients: WebSocket[] = []

    // upload DeviceScript file is needed
    const sendDeviceScript = () => {
        const bytecode = fs.readFileSync(bytecodeFile)
        debug(`refresh bytecode...`)
        const msg = JSON.stringify({
            type: "source",
            channel: "devicescript",
            bytecode: bytecode.toString("hex"),
        })
        clients.forEach(c => c.send(msg))
    }

    const server = http.createServer(function (req, res) {
        const parsedUrl = url.parse(req.url)
        const pathname = parsedUrl.pathname
        if (pathname === "/") {
            res.setHeader("Cache-control", "no-cache")
            res.setHeader("Content-type", "text/html")
            res.end(proxyHtml)
        } else {
            res.statusCode = 404
        }
    })
    function removeClient(client: WebSocket) {
        const i = clients.indexOf(client)
        clients.splice(i, 1)
        log(`client: disconnected (${clients.length} clients)`)
    }
    server.on("upgrade", (request, socket, body) => {
        // is this a socket?
        if (WebSocket.isWebSocket(request)) {
            const client = new WebSocket(request, socket, body)
            const sender = "ws" + Math.random()
            let firstDeviceScript = false
            // store sender id to deduped packet
            client[SENDER_FIELD] = sender
            clients.push(client)
            log(`webclient: connected (${sender}, ${clients.length} clients)`)
            client.on("message", (event: any) => {
                const { data } = event
                if (!firstDeviceScript && sendDeviceScript) {
                    firstDeviceScript = true
                    sendDeviceScript()
                }
            })
            client.on("close", () => removeClient(client))
            client.on("error", (ev: Error) => error(ev))
        }
    })

    const tcpServer = net.createServer((client: any) => {
        const sender = "tcp" + Math.random()
        client[SENDER_FIELD] = sender
        client.send = (pkt0: Buffer) => {
            const pkt = new Uint8Array(pkt0)
            const b = new Uint8Array(1 + pkt.length)
            b[0] = pkt.length
            b.set(pkt, 1)
            try {
                client.write(b)
            } catch {
                try {
                    client.end()
                } catch {} // eslint-disable-line no-empty
            }
        }
        clients.push(client)
        log(`tcpclient: connected (${sender} ${clients.length} clients)`)
        client.on("end", () => removeClient(client))
        client.on("error", (ev: Error) => error(ev))
    })

    server.listen(port, listenHost)
    tcpServer.listen(tcpPort, listenHost)

    debug(`watch ${bytecodeFile}`)
    fs.watch(bytecodeFile, sendDeviceScript)
}
