/**
 * Minimal object pool.
 *
 * Abilities, lights and decals are recycled rather than re-allocated so that a
 * long play session produces (close to) zero garbage after warm-up.
 */
export class ObjectPool<T> {
  private readonly factory: () => T;
  private readonly resetItem: ((item: T) => void) | null;
  private readonly free: T[] = [];

  activeCount = 0;

  /**
   * @param factory creates a new instance when the pool is empty
   * @param reset   called when an item is returned
   * @param prewarm number of instances to build up-front
   */
  constructor(factory: () => T, reset: ((item: T) => void) | null = null, prewarm = 0) {
    this.factory = factory;
    this.resetItem = reset;
    for (let i = 0; i < prewarm; i++) this.free.push(factory());
  }

  acquire(): T {
    const item = this.free.pop() ?? this.factory();
    this.activeCount++;
    return item;
  }

  release(item: T | null | undefined): void {
    if (!item) return;
    this.resetItem?.(item);
    this.free.push(item);
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  dispose(disposer?: (item: T) => void): void {
    if (disposer) this.free.forEach(disposer);
    this.free.length = 0;
    this.activeCount = 0;
  }
}
