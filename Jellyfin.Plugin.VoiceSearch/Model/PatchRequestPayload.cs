using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.VoiceSearch.Model;

/// <summary>
/// Payload passed by the File Transformation plugin when it calls our callback.
/// Must have a <c>Contents</c> property — FileTransformation populates it with the
/// raw file content and replaces it with whatever our method returns.
/// </summary>
public class PatchRequestPayload
{
    [JsonPropertyName("contents")]
    public string? Contents { get; set; }
}
