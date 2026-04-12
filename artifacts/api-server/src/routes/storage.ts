import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number(),
  contentType: z.string(),
});

/**
 * POST /storage/uploads/request-url
 * Accepts JSON metadata, returns a presigned PUT URL and object path.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json({
      uploadURL,
      objectPath,
      metadata: parsed.data,
    });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*filePath
 * Serve public assets unconditionally.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const filePath = req.params.filePath;
    const file = await objectStorageService.searchPublicObject(filePath);

    if (!file) {
      res.status(404).json({ error: "Object not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);
    const contentType = response.headers.get("Content-Type") ?? "application/octet-stream";
    res.setHeader("Content-Type", contentType);

    if (response.body) {
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    } else {
      res.status(204).end();
    }
  } catch (error) {
    console.error("Error serving public object:", error);
    res.status(500).json({ error: "Failed to serve object" });
  }
});

/**
 * GET /storage/objects/*objectPath
 * Serve private uploaded objects.
 */
router.get("/storage/objects/*objectPath", async (req: Request, res: Response) => {
  try {
    const objectPath = `/objects/${req.params.objectPath}`;
    const file = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(file);
    const contentType = response.headers.get("Content-Type") ?? "application/octet-stream";
    res.setHeader("Content-Type", contentType);

    if (response.body) {
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    } else {
      res.status(204).end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    console.error("Error serving object:", error);
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
