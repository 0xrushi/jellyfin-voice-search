namespace Jellyfin.Plugin.VoiceSearch.Model;

/// <summary>
/// Payload passed by the File Transformation plugin when invoking our callback.
/// It deserializes a JObject {"contents": "..."} into this type via Newtonsoft.Json.
/// </summary>
public class PatchRequestPayload
{
    public string? Contents { get; set; }
}
