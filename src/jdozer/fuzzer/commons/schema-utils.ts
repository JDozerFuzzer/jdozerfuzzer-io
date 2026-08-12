import traverse = require("json-schema-traverse");
import Ajv, { ValidateFunction } from "ajv";
import AjvDraft04 from "ajv-draft-04";
import addFormats, { FormatName } from "ajv-formats";
import { Logger } from "@nestjs/common";

export class SchemaUtils {

    private readonly log: Logger = new Logger(SchemaUtils.name);

    private readonly MODERN_SCHEMA_VERSION = 'modern';
    private readonly DRAFT_04_SCHEMA_VERSION = 'draft-04';
    private ajv: Ajv;

    public enforceStrictProperties(schema: JsonSchema): any {

        let newSchema: JsonSchema;
        try {
            newSchema = JSON.parse(JSON.stringify(schema)) as JsonSchema;
        } catch (e) {
            const err: string = `Error cloning the schema: ${e.message}`;
            this.log.error(err, e.stack);
            throw new Error(err);
        }

        traverse(newSchema, (node: any) => {
            if (!node || typeof node !== 'object') return;

            if (node.type === 'object') {
                if (node.additionalProperties === undefined) {
                    node.additionalProperties = false;
                }
            }

            if (!node.type && (node.properties || node.patternProperties)) {
                if (node.additionalProperties === undefined) {
                    node.additionalProperties = false;
                }
            }

        });
        return newSchema;
    }

    public getValidator(schema: any): Ajv {
        const ajvConf = {
            allErrors: true,
            verbose: true,
            strict: true
        };
        switch (this.detectSchemaVersion(schema)) {
            case this.DRAFT_04_SCHEMA_VERSION:
                this.ajv = new AjvDraft04(ajvConf);
                break;
            case this.MODERN_SCHEMA_VERSION:
                this.ajv = new Ajv(ajvConf);
                break;
            default:
                this.ajv = new Ajv(ajvConf);
                break;
        }

        this.ajv.addVocabulary(['example', 'xml']);
        addFormats(this.ajv, {
            mode: 'full',
            formats: (this.formats as FormatName[])
        });

        this.addInt64Keyword();

        return this.ajv;
    }

    private detectSchemaVersion(schema: any): string {
        if (schema.$schema) {
            if (schema.$schema.includes(this.DRAFT_04_SCHEMA_VERSION)) {
                return this.DRAFT_04_SCHEMA_VERSION;
            }
        } else {
            if (schema.id && !schema.$id) {
                return this.DRAFT_04_SCHEMA_VERSION;
            }
        }
        return this.MODERN_SCHEMA_VERSION;
    }

    private addInt64Keyword() {
        this.ajv.addKeyword({
            keyword: 'int64',
            type: 'integer',
            schemaType: 'boolean',
            compile: () => (data: any) => {
                const str = String(data);
                try {
                    const value = BigInt(str);
                    return true;
                } catch {
                    return false;
                }
            },
            errors: false
        });

    }

    validate(schema: any, data: any): { valid: boolean; errors?: any[] | undefined } {

        this.getValidator(schema);

        if (typeof data === 'number' && data > Number.MAX_SAFE_INTEGER) {
            data = data.toString();
        }

        try {
            const validate = this.ajv.compile(schema);
            const valid = validate(data);
            return { valid, errors: validate.errors ? validate.errors : undefined };
        } catch (error) {
            return { valid: false, errors: [{ message: error.message }] };
        }
    }

    private readonly formats = [
        "int32", "int64", "float", "double",
        "byte", "binary",
        "date", "time", "date-time",
        "email", "hostname", "ipv4", "ipv6",
        "uri", "uuid", "uri-reference"
    ];

}

interface JsonSchema {
    type?: string;
    properties?: Record<string, JsonSchema>;
    patternProperties?: Record<string, JsonSchema>;
    additionalProperties?: boolean | JsonSchema;
    items?: JsonSchema | JsonSchema[];
    allOf?: JsonSchema[];
    anyOf?: JsonSchema[];
    oneOf?: JsonSchema[];
    not?: JsonSchema;
    if?: JsonSchema;
    then?: JsonSchema;
    else?: JsonSchema;
    dependencies?: Record<string, JsonSchema | string[]>;
    patternRequired?: string[];
    [key: string]: any;
}

