import "server-only";
import archiver from "archiver";
import { PassThrough, Readable } from "stream";
import { folderFor } from "./services";
import { safeSegment } from "./safe";
import { getBlob } from "./storage";
import type { Job, JobFile } from "./types";

export function zipResponse(job: Job, files: JobFile[]) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new PassThrough();
  archive.pipe(stream);
  const used = new Set<string>();
  const root = safeSegment(job.name, "job");
  const pending = (async () => {
    for (const file of files) {
      const folder = folderFor(file.kind, file.tagNameEn);
      let name = `${root}/${folder}/${safeSegment(file.filename, "file")}`;
      if (used.has(name)) name = `${root}/${folder}/${file.id.slice(0, 8)}-${safeSegment(file.filename, "file")}`;
      used.add(name);
      try {
        const bytes = await getBlob(file.id);
        archive.append(bytes, { name });
      } catch {
        archive.append(`Missing file ${file.filename}\n`, { name: `${name}.missing.txt` });
      }
    }
    await archive.finalize();
  })();
  pending.catch((error) => {
    archive.emit("error", error);
    stream.destroy(error instanceof Error ? error : new Error("zip"));
  });
  const filename = `${root}.zip`;
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
