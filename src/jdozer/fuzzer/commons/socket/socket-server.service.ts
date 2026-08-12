import { Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";


@WebSocketGateway({
    cors: {
        origin: '*'
    },
    transports: ['websocket', 'pooling']
})
export class SocketServer implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {

    private readonly logger: Logger = new Logger(SocketServer.name);

    @WebSocketServer()
    readonly server: Server;

    constructor() { }

    handleDisconnect(client: any) {
        this.logger.debug(`Client disconnected: ${client.id}`);
    }

    handleConnection(client: Socket, ...args: any[]) {
        this.logger.debug(`Client connected: ${client.id}`);
        this.logger.debug(`args: ${args}`);
        client.emit('connection', { status: 'connected', id: client.id });
    }

    afterInit(server: any) {
        this.logger.log(`SocketServer initialized`);
    }

    @OnEvent("jdozer:fuzzer")
    async handleEvent(data: any): Promise<void> {
        this.logger.log(`jdozer:fuzzer ${JSON.stringify(data)}`);
        return this.broadcastMessage('jdozer:fuzzer', data);
    }

    broadcastMessage(event: string, message: any) {
        this.server.emit(event, message);
    }
}