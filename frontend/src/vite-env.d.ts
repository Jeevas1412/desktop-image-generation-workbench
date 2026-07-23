/// <reference types="vite/client" />

declare const __DGX_IMAGE_WORKBENCH_VERSION__: string

interface Window {
  imageWorkbench?: {
    request: (request: { type: string; payload: Record<string, unknown> }) => Promise<unknown>
    pickReference?: () => Promise<{ referenceId: string; displayName: string } | null>
    previewReference?: (referenceId: string) => Promise<{ mimeType: string; base64: string }>
    previewLibraryItem?: (libraryItemId: string) => Promise<{ mimeType: string; base64: string }>
  }
}
