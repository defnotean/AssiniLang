import { describe, expect, it } from "vitest";
import { JobQueue } from "./jobQueue.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("JobQueue", () => {
  it("processes jobs and respects concurrency limits", async () => {
    const queue = new JobQueue(2);
    const order: number[] = [];
    const active: string[] = [];

    const resolvers: Record<string, () => void> = {};
    const promises: Record<string, Promise<void>> = {};

    const createDeferred = (id: string) => {
      let resolveFn!: () => void;
      const promise = new Promise<void>((resolve) => {
        resolveFn = resolve;
      });
      resolvers[id] = resolveFn;
      promises[id] = promise;
    };

    createDeferred("1");
    createDeferred("2");
    createDeferred("3");

    const makeJob = (id: number) => async () => {
      active.push(id.toString());
      expect(active.length).toBeLessThanOrEqual(2);
      await promises[id.toString()];
      order.push(id);
      active.splice(active.indexOf(id.toString()), 1);
    };

    queue.add("1", makeJob(1));
    queue.add("2", makeJob(2));
    queue.add("3", makeJob(3));

    // Yield to let the first 2 jobs start
    await sleep(10);

    expect(active).toEqual(["1", "2"]);
    expect(order).toEqual([]);

    // Finish job 2
    resolvers["2"]();
    // Yield to let job 2 complete and job 3 start
    await sleep(10);

    expect(active).toEqual(["1", "3"]);
    expect(order).toEqual([2]);

    // Finish job 3
    resolvers["3"]();
    // Yield to let job 3 complete
    await sleep(10);

    expect(active).toEqual(["1"]);
    expect(order).toEqual([2, 3]);

    // Finish job 1
    resolvers["1"]();
    // Yield to let job 1 complete
    await sleep(10);

    expect(active).toEqual([]);
    expect(order).toEqual([2, 3, 1]);
  });

  it("does not allow duplicate jobs", async () => {
    const queue = new JobQueue(1);
    let runCount = 0;

    const fn = async () => {
      runCount++;
      await sleep(10);
    };

    queue.add("job-a", fn);
    queue.add("job-a", fn); // should be ignored

    await sleep(25);
    expect(runCount).toBe(1);
  });

  it("tracks pending and active job IDs", async () => {
    const queue = new JobQueue(1);
    const order: string[] = [];

    let resolve1!: () => void;
    const p1 = new Promise<void>((r) => { resolve1 = r; });

    let resolve2!: () => void;
    const p2 = new Promise<void>((r) => { resolve2 = r; });

    queue.add("1", async () => {
      order.push("1");
      await p1;
    });
    queue.add("2", async () => {
      order.push("2");
      await p2;
    });

    await sleep(10);

    const state = queue.getPendingAndActiveIds();
    expect(state.active).toEqual(["1"]);
    expect(state.pending).toEqual(["2"]);
    expect(queue.isQueuedOrActive("1")).toBe(true);
    expect(queue.isQueuedOrActive("2")).toBe(true);
    expect(queue.isQueuedOrActive("3")).toBe(false);

    resolve1();
    await sleep(10);

    const stateMiddle = queue.getPendingAndActiveIds();
    expect(stateMiddle.active).toEqual(["2"]);
    expect(stateMiddle.pending).toEqual([]);

    resolve2();
    await sleep(10);

    const stateEnd = queue.getPendingAndActiveIds();
    expect(stateEnd.active).toEqual([]);
    expect(stateEnd.pending).toEqual([]);
  });
});
