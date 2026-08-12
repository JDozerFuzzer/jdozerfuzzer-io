import { UUID } from "crypto";


export interface FuzzerOperation {
    name: string;
    req: any;
    res: any;
    parameters: any;
    path: string;
    method: string;
    id: UUID;
}