# Future Enhancements

## Image input for `/api/estimate`

Add a fourth input format — image upload — so users can upload architecture diagrams, whiteboard photos, or screenshots and have the agent extract the services automatically.

### Desired flow

```
User uploads image (PNG/JPEG)
        │
        ▼
Server receives image bytes
        │
        ▼
Vision-capable model (google/gemma-4-31-b:free)
reads the image and extracts the architecture description
        │
        ▼
ReAct agent receives the extracted text and
calls aws_calculator with the identified services
        │
        ▼
Returns estimate URL
```

### Three input options for POST /api/estimate

| Format | Content-Type | Description |
|--------|-------------|-------------|
| **PDF** | `multipart/form-data` or `application/pdf` | Architecture documents |
| **Image** | `multipart/form-data` or `image/*` | Architecture diagrams, whiteboard photos |
| **Raw text** | `application/json` | Plain description or JSON service list |

### Implementation notes

- Use `google/gemma-4-31-b:free` via OpenRouter (vision endpoint) to extract structured architecture info from the image
- Pass the image as a base64 data URL in the vision message
- Feed the model's output into the existing `ESTIMATE_SYSTEM_PROMPT` agent pipeline
- Image upload can reuse the same `parseMultipartForm` infrastructure used for PDFs, accepting `image/png`, `image/jpeg`, etc.
