const STT_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => {
    let binary = '';
    const bytes = new Uint8Array(buf);
    // Chunk to avoid stack overflow on large buffers
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
  });
}

export async function transcribeAudio(audioBlob: Blob, apiKey: string): Promise<string> {
  const base64Audio = await blobToBase64(audioBlob);
  const mimeType = audioBlob.type || 'audio/webm';

  const payload = {
    system_instruction: {
      parts: [
        {
          text: 'Transcribe the speech in this audio clip. Return only the transcription text in English, with no additional commentary or explanation.',
        },
      ],
    },
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Audio,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 256,
    },
  };

  const resp = await fetch(`${STT_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Gemini STT error ${resp.status}: ${detail}`);
  }

  const data = await resp.json();
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
}
