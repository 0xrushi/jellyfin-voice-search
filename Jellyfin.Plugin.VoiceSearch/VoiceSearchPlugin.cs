using Jellyfin.Plugin.VoiceSearch.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.VoiceSearch;

/// <summary>
/// Voice Search plugin entry point.
/// Requires the File Transformation plugin to inject the client-side script.
/// </summary>
public class VoiceSearchPlugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public VoiceSearchPlugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    /// <summary>Singleton access used by the API controller.</summary>
    public static VoiceSearchPlugin? Instance { get; private set; }

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("c3d4e5f6-a1b2-4567-89ab-cdef01234567");

    /// <inheritdoc />
    public override string Name => "Voice Search";

    /// <inheritdoc />
    public override string Description =>
        "Voice-controlled search and playback control for Jellyfin Web.";

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        return new[]
        {
            new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = $"{GetType().Namespace}.Configuration.config.html",
            },
        };
    }
}
