using Jellyfin.Plugin.VoiceSearch.Model;

namespace Jellyfin.Plugin.VoiceSearch.Helpers;

/// <summary>
/// Static callbacks invoked by the File Transformation plugin when it serves
/// matching web assets.  Method signatures must stay compatible with what
/// TransformationHelper.ApplyTransformation expects (PatchRequestPayload → string).
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
    public static string IndexHtml(PatchRequestPayload payload)
    {
        var html = payload.Contents ?? string.Empty;

        if (html.Contains(Marker, StringComparison.Ordinal))
        {
            return html; // already injected
        }

        return html.Replace(
            "</body>",
            $"\n    <!-- {Marker} -->\n    {ScriptTag}\n</body>",
            StringComparison.OrdinalIgnoreCase);
    }
}
