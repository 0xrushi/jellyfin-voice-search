namespace Jellyfin.Plugin.VoiceSearch.Helpers;

/// <summary>
/// Static callbacks invoked by the File Transformation plugin when it serves
/// matching web assets. Signature must match TransformFile delegate:
/// Task(string path, Stream contents).
/// </summary>
public static class TransformationPatches
{
    private const string ScriptTag =
        "<script defer src=\"/VoiceSearch/Script\"></script>";

    private const string Marker = "jellyfin-voice-search-injected";

    /// <summary>
    /// Injects the voice-search &lt;script&gt; tag into index.html just before &lt;/body&gt;.
    /// Idempotent — a second call is a no-op.
    /// </summary>
    public static async Task IndexHtml(string path, Stream contents)
    {
        contents.Seek(0, SeekOrigin.Begin);
        string html;
        using (var reader = new StreamReader(contents, leaveOpen: true))
        {
            html = await reader.ReadToEndAsync().ConfigureAwait(false);
        }

        if (html.Contains(Marker, StringComparison.Ordinal))
        {
            return;
        }

        var modified = html.Replace(
            "</body>",
            $"\n    <!-- {Marker} -->\n    {ScriptTag}\n</body>",
            StringComparison.OrdinalIgnoreCase);

        contents.Seek(0, SeekOrigin.Begin);
        contents.SetLength(0);
        await using var writer = new StreamWriter(contents, leaveOpen: true);
        await writer.WriteAsync(modified).ConfigureAwait(false);
    }
}
