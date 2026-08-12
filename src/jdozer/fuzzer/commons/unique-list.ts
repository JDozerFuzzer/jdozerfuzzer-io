

export class UniqueList<T> {

    private items: Set<T>;

    constructor(array?: T[]) {
        this.items = new Set<T>();
        if (array) {
            array.forEach(item => {
                this.add(item);
            });
        }
    }

    add(item: T): void {
        if (this.items.has(item)) {
            throw new DuplicateKeyException(`Duplicate item: ${item}`);
        }
        this.items.add(item);
    }

    has(item: T): boolean {
        return this.items.has(item);
    }

    values(): T[] {
        return Array.from(this.items);
    }

    get size(): number {
        return this.items.size;
    }

    get(index: number): T | undefined {
        if (index < 0 || index >= this.size) {
            return undefined;
        }
        return Array.from(this.items)[index];
    }
}

export class DuplicateKeyException extends Error {
    constructor(key: string) {
        super(`Key ${key} already exists in the map.`);
        this.name = 'DuplicateKeyException';
    }
}