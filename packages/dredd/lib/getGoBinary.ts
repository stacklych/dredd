import childProcess from 'child_process';
import path from 'path';

// Docs:
// - https://golang.org/doc/code.html#GOPATH
// - https://golang.org/cmd/go/#hdr-GOPATH_environment_variable
export default function getGoBinary(
  callback: (err: Error | null, goBinary?: string) => void,
): void {
  const goBin = process.env.GOBIN;
  const goPath = process.env.GOPATH;
  if (goBin) {
    process.nextTick(() => callback(null, goBin));
  } else if (goPath) {
    process.nextTick(() => callback(null, path.join(goPath, 'bin')));
  } else {
    childProcess.exec('go env GOPATH', (err, stdout) => {
      if (err) {
        return callback(err);
      }
      return callback(null, path.join(stdout.trim(), 'bin'));
    });
  }
}
