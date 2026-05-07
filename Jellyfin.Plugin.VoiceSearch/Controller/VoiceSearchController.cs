using System.Reflection;
using System.Text.Json.Serialization;
using Jellyfin.Plugin.VoiceSearch.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.VoiceSearch.Controller;

/// <summary>Provides two endpoints consumed by the client-side voice-search script.</summary>
[ApiController]
[Route("[controller]")]
public class VoiceSearchController : ControllerBase
{
    /// <summary>
    /// Serves the compiled voiceSearch.js bundle (embedded in the DLL).
    /// Injected into index.html as: &lt;script defer src="/VoiceSearch/Script"&gt;
    /// </summary>
    [HttpGet("Script")]
    [AllowAnonymous]
    [Produces("application/javascript")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult GetScript()
    {
        var assembly     = Assembly.GetExecutingAssembly();
        var resourceName = "Jellyfin.Plugin.VoiceSearch.Inject.voiceSearch.js";
        var stream       = assembly.GetManifestResourceStream(resourceName);

        if (stream is null)
        {
            return NotFound("voiceSearch.js resource not found in plugin assembly.");
        }

        // Allow client-side caching for 1 h; the script changes only on plugin update.
        Response.Headers.CacheControl = "public, max-age=3600";
        return File(stream, "application/javascript");
    }

    /// <summary>Returns plugin configuration to the client-side script.</summary>
    [HttpGet("Config")]
    [AllowAnonymous]
    [Produces("application/json")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<ClientConfig> GetConfig()
    {
        var cfg = VoiceSearchPlugin.Instance?.Configuration ?? new PluginConfiguration();

        return Ok(new ClientConfig
        {
            GeminiApiKey      = cfg.GeminiApiKey,
            AutoPlayThreshold = cfg.AutoPlayThreshold,
            SuggestThreshold  = cfg.SuggestThreshold,
        });
    }

    /// <summary>Saves plugin configuration from the admin config page.</summary>
    [HttpPost("Config")]
    [AllowAnonymous]
    [Produces("application/json")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public IActionResult SaveConfig([FromBody] ClientConfig body)
    {
        var plugin = VoiceSearchPlugin.Instance;
        if (plugin is null) return StatusCode(503);

        plugin.Configuration.GeminiApiKey      = body.GeminiApiKey ?? string.Empty;
        plugin.Configuration.AutoPlayThreshold = body.AutoPlayThreshold > 0 ? body.AutoPlayThreshold : 85;
        plugin.Configuration.SuggestThreshold  = body.SuggestThreshold  > 0 ? body.SuggestThreshold  : 60;
        plugin.SaveConfiguration();

        return Ok(new { saved = true });
    }
}

/// <summary>Shape of JSON returned by GET /VoiceSearch/Config.</summary>
public sealed class ClientConfig
{
    [JsonPropertyName("geminiApiKey")]
    public string GeminiApiKey { get; set; } = string.Empty;

    [JsonPropertyName("autoPlayThreshold")]
    public int AutoPlayThreshold { get; set; } = 85;

    [JsonPropertyName("suggestThreshold")]
    public int SuggestThreshold { get; set; } = 60;
}
