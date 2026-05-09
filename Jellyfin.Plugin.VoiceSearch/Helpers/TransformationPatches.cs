using Jellyfin.Plugin.VoiceSearch.Model;

namespace Jellyfin.Plugin.VoiceSearch.Helpers;

/// <summary>
/// Static callback invoked by the File Transformation plugin.
/// TransformationHelper deserializes a JObject {"contents":"..."} into
/// PatchRequestPayload and expects a string return value with the modified HTML.
/// </summary>
public static class TransformationPatches
{
    private const string ScriptTag =
        "<script defer src=\"/VoiceSearch/Script\"></script>";

    private const string Marker = "jellyfin-voice-search-injected";

    public static string IndexHtml(PatchRequestPayload payload)
    {
        var html = payload.Contents ?? string.Empty;

        if (html.Contains(Marker, StringComparison.Ordinal))
        {
            return html;
        }

        return html.Replace(
            "</body>",
            $"\n    <!-- {Marker} -->\n    {ScriptTag}\n</body>",
            StringComparison.OrdinalIgnoreCase);
    }
}
