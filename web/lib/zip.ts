import archiver from "archiver";
import { createWriteStream } from "node:fs";

export async function zipDirectory(srcDir: string, outZip: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outZip);
    const archive = archiver("zip", { zlib: { level: 6 } });

    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.on("warning", (err) => {
      if (err.code !== "ENOENT") reject(err);
    });

    archive.pipe(output);
    archive.directory(srcDir, false);
    void archive.finalize();
  });
}
