export type ArtifactType = "image" | "file";

export interface AttachmentReference {
  id: string;
  type: ArtifactType;
  originName: string;
  mimeType?: string;
  sourcePath?: string;
}

export interface DownloadedArtifact {
  id: string;
  type: ArtifactType;
  originName: string;
  mimeType?: string;
  sourcePath: string;
  size?: number;
}

export interface StoredArtifact {
  id: string;
  type: ArtifactType;
  originName: string;
  mimeType?: string;
  localPath: string;
  size: number;
  sha256: string;
  createdAt: string;
}
