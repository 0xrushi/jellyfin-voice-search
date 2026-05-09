using MediaBrowser.Common.Configuration;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.VoiceSearch.Services;

public class StartupService : IScheduledTask
{
    private const string ScriptTag = "<script defer src=\"/VoiceSearch/Script\"></script>";
    private const string Marker    = "jellyfin-voice-search-injected";

    private readonly ILogger<StartupService> _logger;
    private readonly IApplicationPaths _applicationPaths;

    public StartupService(ILogger<StartupService> logger, IApplicationPaths applicationPaths)
    {
        _logger = logger;
        _applicationPaths = applicationPaths;
    }

    public string Name        => "Voice Search Startup";
    public string Key         => "Jellyfin.Plugin.VoiceSearch.Startup";
    public string Description => "Injects the voice-search script tag into Jellyfin's index.html.";
    public string Category    => "Startup Services";

    public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        progress.Report(0);

        var indexHtmlPath = Path.Combine(_applicationPaths.WebPath, "index.html");

        if (!File.Exists(indexHtmlPath))
        {
            _logger.LogWarning("[VoiceSearch] index.html not found at {Path}", indexHtmlPath);
            progress.Report(100);
            return;
        }

        var html = await File.ReadAllTextAsync(indexHtmlPath, cancellationToken).ConfigureAwait(false);

        if (html.Contains(Marker, StringComparison.Ordinal))
        {
            _logger.LogInformation("[VoiceSearch] Script already injected, skipping.");
            progress.Report(100);
            return;
        }

        var modified = html.Replace(
            "</body>",
            $"\n    <!-- {Marker} -->\n    {ScriptTag}\n</body>",
            StringComparison.OrdinalIgnoreCase);

        await File.WriteAllTextAsync(indexHtmlPath, modified, cancellationToken).ConfigureAwait(false);
        _logger.LogInformation("[VoiceSearch] Script injected into {Path}", indexHtmlPath);

        progress.Report(100);
    }

    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        return new[]
        {
            new TaskTriggerInfo { Type = TaskTriggerInfo.TriggerStartup },
        };
    }
}
