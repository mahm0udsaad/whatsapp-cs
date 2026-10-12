// Chat attachments go straight to storage through a signed URL: the backend
// caps request bodies at a few MB, so a video sent as multipart never arrives.

const mockGetInfoAsync = jest.fn();
const mockUploadAsync = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "token" } },
      })),
    },
  },
}));

jest.mock("expo-file-system/legacy", () => ({
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  uploadAsync: (...args: unknown[]) => mockUploadAsync(...args),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
}));

import {
  ATTACHMENT_TOO_LARGE_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  uploadConversationMedia,
} from "../lib/api";

const video = {
  uri: "file:///cache/loyalty-dashboard.mp4",
  name: "loyalty-dashboard.mp4",
  type: "video/mp4",
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("uploadConversationMedia", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    mockGetInfoAsync.mockReset();
    mockUploadAsync.mockReset();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("sends only metadata to the backend and streams the file to storage", async () => {
    const sizeBytes = 12 * 1024 * 1024;
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: sizeBytes });
    fetchMock.mockResolvedValue(
      jsonResponse({
        storagePath: "rest-1/conv-1/2026/10/abc.mp4",
        signedUrl: "https://storage.example/upload?token=t",
      })
    );
    mockUploadAsync.mockResolvedValue({ status: 200 });

    const attachment = await uploadConversationMedia("conv-1", video);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/mobile/inbox/conversations/conv-1/upload-url");
    expect(JSON.parse(init.body)).toEqual({ contentType: "video/mp4", sizeBytes });

    expect(mockUploadAsync).toHaveBeenCalledWith(
      "https://storage.example/upload?token=t",
      video.uri,
      expect.objectContaining({
        httpMethod: "PUT",
        headers: { "content-type": "video/mp4" },
      })
    );
    expect(attachment).toEqual({
      storagePath: "rest-1/conv-1/2026/10/abc.mp4",
      contentType: "video/mp4",
      sizeBytes,
      originalFilename: video.name,
    });
  });

  it("rejects files over the WhatsApp limit before uploading anything", async () => {
    mockGetInfoAsync.mockResolvedValue({
      exists: true,
      size: MAX_ATTACHMENT_BYTES + 1,
    });

    await expect(uploadConversationMedia("conv-1", video)).rejects.toThrow(
      ATTACHMENT_TOO_LARGE_MESSAGE
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockUploadAsync).not.toHaveBeenCalled();
  });

  it("fails when storage refuses the upload", async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
    fetchMock.mockResolvedValue(
      jsonResponse({ storagePath: "p", signedUrl: "https://storage.example/u" })
    );
    mockUploadAsync.mockResolvedValue({ status: 403 });

    await expect(uploadConversationMedia("conv-1", video)).rejects.toThrow("403");
  });
});
