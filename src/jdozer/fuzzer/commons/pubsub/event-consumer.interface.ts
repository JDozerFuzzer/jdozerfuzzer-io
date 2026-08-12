
export interface EventConsumer {
    readonly channels: string[];
    readonly entityType: string;
    readonly eventType: string;
    handleEvent(data: any, channel: string): Promise<void> | void;
}