using System.Runtime.Loader;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.VoiceSearch.Services;

/// <summary>
/// Runs at Jellyfin startup and registers the index.html transformation with
/// the File Transformation plugin (github.com/IAmParadox27/jellyfin-plugin-file-transformation).
///
/// We use reflection so there is no hard compile-time dependency on that plugin —
/// it simply won't inject the script if File Transformation isn't installed, and
/// logs a warning instead.
/// </summary>
public class StartupService : IScheduledTask
{
    // Stable GUIDs — must not change between releases or the transformation
    // will be registered twice after an update.
    private static readonly Guid IndexHtmlTransformId =
        Guid.Parse("b7c8d9e0-f1a2-3456-789a-bcde012345f6");

    private readonly ILogger<StartupService> _logger;

    public StartupService(ILogger<StartupService> logger)
    {
        _logger = logger;
    }

    public string Name        => "Voice Search Startup";
    public string Key         => "Jellyfin.Plugin.VoiceSearch.Startup";
    public string Description => "Injects the voice-search script into the Jellyfin web client via File Transformation.";
    public string Category    => "Startup Services";

    public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        progress.Report(0);

        // Locate the File Transformation plugin assembly across all load contexts.
        var ftAssembly = AssemblyLoadContext.All
            .SelectMany(ctx => ctx.Assemblies)
            .FirstOrDefault(a => a.FullName?.Contains(".FileTransformation") ?? false);

        if (ftAssembly is null)
        {
            _logger.LogWarning(
                "[VoiceSearch] File Transformation plugin not found. " +
                "Install it from the Jellyfin plugin catalogue — Voice Search needs it to inject the client-side script.");
            progress.Report(100);
            return;
        }

        var pluginInterfaceType = ftAssembly.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
        var registerMethod      = pluginInterfaceType?.GetMethod("RegisterTransformation");

        if (registerMethod is null)
        {
            _logger.LogError(
                "[VoiceSearch] RegisterTransformation not found on Jellyfin.Plugin.FileTransformation.PluginInterface. " +
                "The File Transformation plugin may be an incompatible version.");
            progress.Report(100);
            return;
        }

        // Build the JObject payload exactly as FileTransformation expects it.
        var payload = new JObject
        {
            ["id"]               = IndexHtmlTransformId,
            ["fileNamePattern"]  = "index\\.html$",
            ["callbackAssembly"] = typeof(StartupService).Assembly.FullName,
            ["callbackClass"]    = "Jellyfin.Plugin.VoiceSearch.Helpers.TransformationPatches",
            ["callbackMethod"]   = "IndexHtml",
        };

        registerMethod.Invoke(null, new object?[] { payload });

        _logger.LogInformation("[VoiceSearch] index.html transformation registered successfully.");
        progress.Report(100);

        await Task.CompletedTask;
    }

    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        return new[]
        {
            new TaskTriggerInfo { Type = TaskTriggerInfo.TriggerStartup },
        };
    }
}
