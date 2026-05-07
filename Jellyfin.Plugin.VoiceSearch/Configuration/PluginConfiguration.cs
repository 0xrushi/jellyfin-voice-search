using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.VoiceSearch.Configuration;

/// <summary>Server-side plugin configuration stored in Jellyfin's config store.</summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Google Gemini API key. Required for intent parsing and STT in non-Chrome browsers.</summary>
    public string GeminiApiKey { get; set; } = string.Empty;

    /// <summary>Confidence % at which a result is auto-played without confirmation (default 85).</summary>
    public int AutoPlayThreshold { get; set; } = 85;

    /// <summary>Confidence % at which a "Did you mean?" dialog is shown (default 60).</summary>
    public int SuggestThreshold { get; set; } = 60;
}
