import { Logger, OnModuleInit } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import * as http from 'http';
import { AddressInfo } from "net";


@WebSocketGateway({
    cors: {
        origin: '*'
    },
    transports: ['websocket', 'polling']
})
export class SocketServer implements OnModuleInit, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {

    private readonly logger: Logger = new Logger(SocketServer.name);

    @WebSocketServer()
    readonly server: Server;

    private httpServer: http.Server;

    constructor() { }

    async onModuleInit() {
        this.logger.log(`SocketServer initialized`);
        const wsPort: number = parseInt(process.env.FUZZER_WS_PORT || '3002');

        this.httpServer = http.createServer();
        this.server.attach(this.httpServer);

        this.httpServer.listen(wsPort, () => {
            this.logger.log(`SocketServer running on port ${(this.httpServer.address() as AddressInfo).port}`);
        });

    }

    handleDisconnect(client: any) {
        this.logger.debug(`Client disconnected: ${client.id}`);
    }

    handleConnection(client: Socket, ...args: any[]) {
        this.logger.debug(`Client connected: ${client.id}`);
        this.logger.debug(`args: ${args}`);
        client.emit('connection', { status: 'connected', id: client.id });
    }

    afterInit(server: Server) {
        this.logger.log(`SocketServer initialized`);
    }

    @OnEvent("jdozer:fuzzer")
    async handleEvent(data: any): Promise<void> {
        this.logger.verbose(`[handleEvent] ${data.headers.entityType} - ${data.headers.eventType}`);
        return this.broadcastMessage('jdozerfuzzer', data);
    }

    @SubscribeMessage('jdozer:fuzzer')
    handlerMessage(client: Socket, message: any) {
        this.logger.debug(`[handlerMessage] ${JSON.stringify(message)}`);
    }

    broadcastMessage(event: string, message: any) {
        this.server.emit(event, message);
    }
}