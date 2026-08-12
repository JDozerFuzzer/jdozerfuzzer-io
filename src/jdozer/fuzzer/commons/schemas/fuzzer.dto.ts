import { UUID } from "crypto";

export interface FuzzerServer {
    url: string;
    description: string;
}


export interface Fuzzer {
    id: UUID;
    name: string;
    version: string;
    servers: FuzzerServer[];
    operationIds: string[];
}