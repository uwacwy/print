
export namespace Tree {
  export const Pick = <T>(
    root: T,
    getChild: (node: T) => T | null,
    stopPredicate: (node: null | T) => boolean = () => true
  ) => {
    const nodes = [];
    let node: T | null = root;
    while (node) {
      nodes.push(node);
      node = getChild(node);
      if (stopPredicate(node)) {
        break;
      }
    }
    return nodes;
  };

  export const bfsPick = <T>(
    root: T,
    getChildren: (node: T) => T[]
  ) => {
    const nodes = [];
    const queue = [root];
    while (queue.length) {
      const node = queue.shift()!;
      nodes.push(node);
      queue.push(...getChildren(node));
    }
    return nodes;
  };
}
