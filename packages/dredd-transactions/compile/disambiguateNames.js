import compileTransactionName from './compileTransactionName.js';

function requestContentType(transaction) {
  const header = (transaction.request.headers || [])
    .find(({ name }) => name.toLowerCase() === 'content-type');
  return header ? header.value : undefined;
}

function rename(transaction, segments) {
  /* eslint-disable no-param-reassign */
  transaction.origin.exampleName = [transaction.origin.exampleName, ...segments]
    .filter(Boolean)
    .join(' > ');
  transaction.name = compileTransactionName(transaction.origin);
  /* eslint-enable */
}

// Gives every transaction a unique name, so hooks and --only can address it.
// Transactions that differ only in request Content-Type, or in coming from a
// `default` response rather than a status code, otherwise share a name. The
// first transaction of a colliding group keeps its name; each other one gets
// extra segments: 'request <content type>' when its request Content-Type
// differs, 'default' for a `default` response, and '#<n>' if still not unique.
//
// `entries` is an array of { transaction, isDefault }. Mutates the transactions.
export default function disambiguateNames(entries) {
  const groups = new Map();
  entries.forEach((entry) => {
    const { name } = entry.transaction;
    if (!groups.has(name)) { groups.set(name, []); }
    groups.get(name).push(entry);
  });

  groups.forEach((group) => {
    if (group.length < 2) { return; }
    const [first] = group;
    const firstContentType = requestContentType(first.transaction);
    group.slice(1).forEach((entry) => {
      const segments = [];
      const contentType = requestContentType(entry.transaction);
      if (contentType && contentType !== firstContentType) {
        segments.push(`request ${contentType}`);
      }
      if (entry.isDefault && !first.isDefault) {
        segments.push('default');
      }
      rename(entry.transaction, segments);
    });
  });

  const seen = new Map();
  entries.forEach(({ transaction }) => {
    const count = (seen.get(transaction.name) || 0) + 1;
    seen.set(transaction.name, count);
    if (count > 1) {
      rename(transaction, [`#${count}`]);
    }
  });
}
