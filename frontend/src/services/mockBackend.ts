import {
  Device,
  DeviceConfig,
  DeviceCommand,
  Language,
  ApiJob,
  Conversation,
  Settings,
  AdminStats,
  SystemHealth,
  ApiKey,
  TelemetrySample,
  CommandType,
} from '../types';

// Initial Languages Database
export const INITIAL_LANGUAGES: Language[] = [
  {
    code: 'en-US',
    name: 'English (US)',
    capabilities: {
      stt: true,
      translate: true,
      tts: true,
    },
    valid_targets: ['es-ES', 'fr-FR', 'de-DE', 'ja-JP', 'zh-CN', 'it-IT', 'pt-BR', 'ko-KR', 'ar-SA', 'hi-IN'],
    voices: [
      { id: 'en-US-Joanna', name: 'Joanna (Neural)', gender: 'female', neural: true },
      { id: 'en-US-Matthew', name: 'Matthew (Neural)', gender: 'male', neural: true },
      { id: 'en-US-Ruth', name: 'Ruth (Neural Generative)', gender: 'female', neural: true },
    ],
  },
  {
    code: 'es-ES',
    name: 'Spanish (Spain)',
    capabilities: {
      stt: true,
      translate: true,
      tts: true,
    },
    valid_targets: ['en-US', 'fr-FR', 'de-DE', 'it-IT', 'pt-BR'],
    voices: [
      { id: 'es-ES-Lucia', name: 'Lucia (Neural)', gender: 'female', neural: true },
      { id: 'es-ES-Sergio', name: 'Sergio (Neural)', gender: 'male', neural: true },
    ],
  },
  {
    code: 'fr-FR',
    name: 'French (France)',
    capabilities: {
      stt: true,
      translate: true,
      tts: true,
    },
    valid_targets: ['en-US', 'es-ES', 'de-DE', 'it-IT', 'ja-JP'],
    voices: [
      { id: 'fr-FR-Lea', name: 'Léa (Neural)', gender: 'female', neural: true },
      { id: 'fr-FR-Remi', name: 'Rémi (Neural)', gender: 'male', neural: true },
    ],
  },
  {
    code: 'de-DE',
    name: 'German (Germany)',
    capabilities: {
      stt: true,
      translate: true,
      tts: true,
    },
    valid_targets: ['en-US', 'es-ES', 'fr-FR', 'it-IT'],
    voices: [
      { id: 'de-DE-Vicki', name: 'Vicki (Neural)', gender: 'female', neural: true },
      { id: 'de-DE-Daniel', name: 'Daniel (Neural)', gender: 'male', neural: true },
    ],
  },
  {
    code: 'ja-JP',
    name: 'Japanese (Japan)',
    capabilities: {
      stt: true,
      translate: true,
      tts: true,
    },
    valid_targets: ['en-US', 'zh-CN', 'ko-KR', 'fr-FR'],
    voices: [
      { id: 'ja-JP-Kazuha', name: 'Kazuha (Neural)', gender: 'female', neural: true },
      { id: 'ja-JP-Tomoki', name: 'Tomoki (Neural)', gender: 'male', neural: true },
    ],
  },
  {
    code: 'zh-CN',
    name: 'Chinese (Mandarin Simplified)',
    capabilities: {
      stt: true,
      translate: true,
      tts: true,
    },
    valid_targets: ['en-US', 'ja-JP', 'ko-KR'],
    voices: [
      { id: 'zh-CN-Zhiyu', name: 'Zhiyu (Neural)', gender: 'female', neural: true },
    ],
  },
  {
    code: 'it-IT',
    name: 'Italian (Italy)',
    capabilities: {
      stt: true,
      translate: true,
      tts: true,
    },
    valid_targets: ['en-US', 'es-ES', 'fr-FR', 'de-DE'],
    voices: [
      { id: 'it-IT-Bianca', name: 'Bianca (Neural)', gender: 'female', neural: true },
      { id: 'it-IT-Adriano', name: 'Adriano (Neural)', gender: 'male', neural: true },
    ],
  },
  {
    code: 'pt-BR',
    name: 'Portuguese (Brazil)',
    capabilities: {
      stt: true,
      translate: true,
      tts: true,
    },
    valid_targets: ['en-US', 'es-ES'],
    voices: [
      { id: 'pt-BR-Camila', name: 'Camila (Neural)', gender: 'female', neural: true },
      { id: 'pt-BR-Thiago', name: 'Thiago (Neural)', gender: 'male', neural: true },
    ],
  },
  {
    code: 'ko-KR',
    name: 'Korean (South Korea)',
    capabilities: {
      stt: true,
      translate: true,
      tts: true,
    },
    valid_targets: ['en-US', 'ja-JP', 'zh-CN'],
    voices: [
      { id: 'ko-KR-Seoyeon', name: 'Seoyeon (Neural)', gender: 'female', neural: true },
    ],
  },
  {
    code: 'ar-SA',
    name: 'Arabic (Saudi Arabia)',
    capabilities: {
      stt: true,
      translate: true,
      tts: true,
    },
    valid_targets: ['en-US', 'fr-FR'],
    voices: [
      { id: 'ar-SA-Zeina', name: 'Zeina (Standard)', gender: 'female', neural: false },
      { id: 'ar-SA-Hala', name: 'Hala (Neural)', gender: 'female', neural: true },
    ],
  },
];

// Initial Devices
export const INITIAL_DEVICES: Device[] = [
  {
    device_id: 'dev-aurora-01',
    name: 'Lobby Kiosk Alpha',
    online: true,
    last_seen: new Date().toISOString(),
    firmware_version: 'v2.4.1',
    rssi: -62,
    config_version: 3,
    applied_config_version: 3,
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    config: {
      language_a: 'en-US',
      language_b: 'es-ES',
      mode: 'auto_detect',
      voice_map: { 'en-US': 'en-US-Joanna', 'es-ES': 'es-ES-Lucia' },
      speech_rate_pct: 100,
      volume_pct: 90,
      max_recording_sec: 15,
      heartbeat_interval_sec: 45,
    },
  },
  {
    device_id: 'dev-titan-02',
    name: 'Conference Room 402',
    online: true,
    last_seen: new Date(Date.now() - 15000).toISOString(),
    firmware_version: 'v2.4.1',
    rssi: -71,
    config_version: 2,
    applied_config_version: 2,
    created_at: new Date(Date.now() - 86400000 * 25).toISOString(),
    config: {
      language_a: 'en-US',
      language_b: 'ja-JP',
      mode: 'buttons',
      voice_map: { 'en-US': 'en-US-Matthew', 'ja-JP': 'ja-JP-Kazuha' },
      speech_rate_pct: 95,
      volume_pct: 85,
      max_recording_sec: 20,
      heartbeat_interval_sec: 60,
    },
  },
  {
    device_id: 'dev-pocket-03',
    name: 'Field Guide Unit 07',
    online: true,
    last_seen: new Date(Date.now() - 32000).toISOString(),
    firmware_version: 'v2.3.9',
    rssi: -79,
    config_version: 5,
    applied_config_version: 4, // Pending sync demonstration!
    created_at: new Date(Date.now() - 86400000 * 18).toISOString(),
    config: {
      language_a: 'en-US',
      language_b: 'fr-FR',
      mode: 'buttons',
      voice_map: { 'en-US': 'en-US-Ruth', 'fr-FR': 'fr-FR-Lea' },
      speech_rate_pct: 100,
      volume_pct: 75,
      max_recording_sec: 12,
      heartbeat_interval_sec: 30,
    },
  },
  {
    device_id: 'dev-nexus-04',
    name: 'Customer Desk East',
    online: false,
    last_seen: new Date(Date.now() - 86400000 * 2).toISOString(),
    firmware_version: 'v2.2.0',
    rssi: -92,
    config_version: 1,
    applied_config_version: 1,
    created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
    config: {
      language_a: 'en-US',
      language_b: 'zh-CN',
      mode: 'auto_detect',
      voice_map: { 'en-US': 'en-US-Joanna', 'zh-CN': 'zh-CN-Zhiyu' },
      speech_rate_pct: 100,
      volume_pct: 80,
      max_recording_sec: 15,
      heartbeat_interval_sec: 60,
    },
  },
  {
    device_id: 'dev-echo-05',
    name: 'Executive Suite Translator',
    online: true,
    last_seen: new Date(Date.now() - 8000).toISOString(),
    firmware_version: 'v2.4.1',
    rssi: -58,
    config_version: 4,
    applied_config_version: 4,
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    config: {
      language_a: 'en-US',
      language_b: 'de-DE',
      mode: 'auto_detect',
      voice_map: { 'en-US': 'en-US-Matthew', 'de-DE': 'de-DE-Daniel' },
      speech_rate_pct: 100,
      volume_pct: 85,
      max_recording_sec: 15,
      heartbeat_interval_sec: 60,
    },
  },
];

// Initial Settings
export const INITIAL_SETTINGS: Settings = {
  service_enabled: true,
  max_utterance_sec: 15,
  max_file_size_mb: 4,
  max_duration_sec: 300,
  retention_days: 30,
  store_audio: true,
  language_id_min_confidence: 0.85,
  conversation_idle_sec: 180,
  device_rate_limit_per_min: 30,
  device_daily_quota: 500,
  default_heartbeat_interval_sec: 60,
  allowed_languages: ['en-US', 'es-ES', 'fr-FR', 'de-DE', 'ja-JP', 'zh-CN', 'it-IT', 'pt-BR', 'ko-KR', 'ar-SA'],
  voice_map: {
    'en-US': 'en-US-Joanna',
    'es-ES': 'es-ES-Lucia',
    'fr-FR': 'fr-FR-Lea',
    'de-DE': 'de-DE-Daniel',
    'ja-JP': 'ja-JP-Kazuha',
    'zh-CN': 'zh-CN-Zhiyu',
    'it-IT': 'it-IT-Bianca',
    'pt-BR': 'pt-BR-Camila',
    'ko-KR': 'ko-KR-Seoyeon',
    'ar-SA': 'ar-SA-Hala',
  },
  providers: {
    stt_chains: ['groq', 'xai'],
    translate_chains: ['groq', 'xai'],
    tts_chains: ['edge', 'xai'],
    allow_paid_fallback: false,
    models: {
      groq_stt_model: 'whisper-large-v3-turbo',
      groq_chat_model: 'llama-3.1-8b-instant',
      xai_chat_model: 'grok-2-latest',
    },
  },
};

// Initial API Keys
export const INITIAL_API_KEYS: ApiKey[] = [
  {
    id: 'key_prod_app_99a',
    name: 'Hospitality Mobile App Client',
    key_prefix: 'px_live_99a8',
    created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
    last_used_at: new Date(Date.now() - 1800000).toISOString(),
    status: 'active',
  },
  {
    id: 'key_staging_test_21b',
    name: 'QA Automation Runner',
    key_prefix: 'px_test_21b7',
    created_at: new Date(Date.now() - 86400000 * 12).toISOString(),
    last_used_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    status: 'active',
  },
  {
    id: 'key_deprecated_sdk_03c',
    name: 'Legacy Field Agent SDK',
    key_prefix: 'px_live_03c4',
    created_at: new Date(Date.now() - 86400000 * 120).toISOString(),
    last_used_at: new Date(Date.now() - 86400000 * 15).toISOString(),
    status: 'revoked',
  },
];

class MockBackendState {
  public devices: Device[] = [...INITIAL_DEVICES];
  public languages: Language[] = [...INITIAL_LANGUAGES];
  public settings: Settings = { ...INITIAL_SETTINGS };
  public apiKeys: ApiKey[] = [...INITIAL_API_KEYS];
  public jobs: ApiJob[] = [];
  public commands: Record<string, DeviceCommand[]> = {};
  public deviceKeys: Record<string, string> = {
    'dev-aurora-01': 'px_dev_sec_aurora928371',
    'dev-titan-02': 'px_dev_sec_titan481920',
    'dev-pocket-03': 'px_dev_sec_pocket554821',
    'dev-nexus-04': 'px_dev_sec_nexus338190',
    'dev-echo-05': 'px_dev_sec_echo771928',
  };
  public conversations: Conversation[] = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.seedSeedData();
    this.startHeartbeatSimulation();
  }

  private seedSeedData() {
    const now = Date.now();
    // Seed initial commands
    this.commands['dev-aurora-01'] = [
      {
        id: 'cmd-901',
        device_id: 'dev-aurora-01',
        type: 'identify',
        status: 'done',
        created_at: new Date(now - 3600000 * 2).toISOString(),
        acked_at: new Date(now - 3600000 * 2 + 1500).toISOString(),
        detail: 'LED ring flashed 3 times',
      },
      {
        id: 'cmd-902',
        device_id: 'dev-aurora-01',
        type: 'sync_config',
        status: 'done',
        created_at: new Date(now - 3600000 * 24).toISOString(),
        acked_at: new Date(now - 3600000 * 24 + 2100).toISOString(),
        detail: 'Applied config v3',
      },
    ];

    this.commands['dev-pocket-03'] = [
      {
        id: 'cmd-903',
        device_id: 'dev-pocket-03',
        type: 'sync_config',
        status: 'pending',
        created_at: new Date(now - 30000).toISOString(),
        detail: 'Pending device heartbeat sync',
      },
    ];

    // Seed conversations & jobs
    const sampleUtterances = [
      {
        src: 'en-US',
        tgt: 'es-ES',
        srcText: 'Good morning! Could you direct me to the departures hall?',
        tgtText: '¡Buenos días! ¿Podría indicarme el camino a la sala de salidas?',
        dev: 'dev-aurora-01',
      },
      {
        src: 'es-ES',
        tgt: 'en-US',
        srcText: 'Por supuesto, tome las escaleras eléctricas a la derecha.',
        tgtText: 'Of course, take the escalators on the right.',
        dev: 'dev-aurora-01',
      },
      {
        src: 'en-US',
        tgt: 'ja-JP',
        srcText: 'We look forward to partnering on the new sensor architecture.',
        tgtText: '新しいセンサーアーキテクチャでの提携を楽しみにしております。',
        dev: 'dev-titan-02',
      },
      {
        src: 'ja-JP',
        tgt: 'en-US',
        srcText: 'こちらこそ、素晴らしいプロジェクトになることを期待しています。',
        tgtText: 'Likewise, we anticipate this will be a wonderful project.',
        dev: 'dev-titan-02',
      },
      {
        src: 'en-US',
        tgt: 'fr-FR',
        srcText: 'Where can I find the presentation slides for today session?',
        tgtText: 'Où puis-je trouver les diapositives de la présentation d’aujourd’hui ?',
        dev: 'dev-pocket-03',
      },
    ];

    const convId1 = 'conv_aurora_881';
    const convId2 = 'conv_titan_882';

    const turns1: ApiJob[] = [];
    const turns2: ApiJob[] = [];

    sampleUtterances.forEach((item, index) => {
      const jobId = `job_seed_${100 + index}`;
      const isFirst = index < 2;
      const convId = isFirst ? convId1 : convId2;
      const jobTime = new Date(now - (sampleUtterances.length - index) * 180000).toISOString();

      const job: ApiJob = {
        job_id: jobId,
        kind: 'utterance',
        device_id: item.dev,
        conversation_id: convId,
        status: 'completed',
        source_language: item.src,
        detected_language: item.src,
        target_language: item.tgt,
        transcript: item.srcText,
        translation: item.tgtText,
        original_audio_url: `https://mock.paralax.io/audio/${jobId}_orig.wav`,
        translated_audio_url: `https://mock.paralax.io/audio/${jobId}_trans.wav`,
        duration_sec: 3.4 + (index % 3) * 0.8,
        timings: {
          stt_ms: 180 + (index * 25) % 80,
          translate_ms: 65 + (index * 15) % 40,
          synthesize_ms: 110 + (index * 20) % 50,
          total_ms: 355 + (index * 60) % 150,
        },
        created_at: jobTime,
        updated_at: jobTime,
      };

      this.jobs.unshift(job);
      if (isFirst) {
        turns1.push(job);
      } else if (index < 4) {
        turns2.push(job);
      }
    });

    // Add a few failed jobs for realism and health check
    const failedJob: ApiJob = {
      job_id: 'job_fail_901',
      kind: 'utterance',
      device_id: 'dev-pocket-03',
      status: 'failed',
      source_language: 'en-US',
      detected_language: 'en-US',
      target_language: 'es-ES',
      error: {
        code: 'no_speech_detected',
        message: 'No speech was detected in the submitted audio recording.',
      },
      created_at: new Date(now - 7200000).toISOString(),
      updated_at: new Date(now - 7200000).toISOString(),
    };

    const failedJob2: ApiJob = {
      job_id: 'job_fail_902',
      kind: 'file',
      filename: 'meeting_audio_chunk.wav',
      status: 'failed',
      source_language: 'en-US',
      target_language: 'ar-SA',
      error: {
        code: 'low_confidence_language',
        message: 'Spoken language confidence was below the required threshold.',
      },
      created_at: new Date(now - 14400000).toISOString(),
      updated_at: new Date(now - 14400000).toISOString(),
    };

    this.jobs.unshift(failedJob);
    this.jobs.unshift(failedJob2);

    this.conversations.push({
      conversation_id: convId1,
      device_id: 'dev-aurora-01',
      started_at: turns1[0]?.created_at || new Date().toISOString(),
      updated_at: turns1[turns1.length - 1]?.created_at || new Date().toISOString(),
      turns: turns1.map((t, idx) => ({ ...t, turn_index: idx + 1 })),
    });

    this.conversations.push({
      conversation_id: convId2,
      device_id: 'dev-titan-02',
      started_at: turns2[0]?.created_at || new Date().toISOString(),
      updated_at: turns2[turns2.length - 1]?.created_at || new Date().toISOString(),
      turns: turns2.map((t, idx) => ({ ...t, turn_index: idx + 1 })),
    });
  }

  private startHeartbeatSimulation() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      // Simulate subtle device updates
      this.devices = this.devices.map((device) => {
        if (!device.online) return device;
        // Jitter RSSI between -55 and -85
        const rssiDrift = Math.floor(Math.random() * 5) - 2;
        const newRssi = Math.max(-95, Math.min(-50, device.rssi + rssiDrift));

        // If config sync was pending, auto-apply after delay
        let appliedVer = device.applied_config_version;
        if (device.config_version > device.applied_config_version) {
          appliedVer = device.config_version;
          // Mark any pending sync commands as done
          if (this.commands[device.device_id]) {
            this.commands[device.device_id] = this.commands[device.device_id].map((cmd) =>
              cmd.type === 'sync_config' && cmd.status === 'pending'
                ? { ...cmd, status: 'done', acked_at: new Date().toISOString(), detail: `Applied config v${appliedVer}` }
                : cmd
            );
          }
        }

        return {
          ...device,
          last_seen: new Date().toISOString(),
          rssi: newRssi,
          applied_config_version: appliedVer,
        };
      });
    }, 12000);
  }

  // --- Devices ---
  public getDevices(): Device[] {
    return this.devices;
  }

  public getDevice(id: string): Device | undefined {
    return this.devices.find((d) => d.device_id === id);
  }

  public registerDevice(params: {
    name: string;
    language_a: string;
    language_b: string;
    mode: 'buttons' | 'auto_detect';
    voice_map: Record<string, string>;
  }): { device: Device; device_key: string } {
    const slug = params.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 12);
    const deviceId = `dev-${slug || 'node'}-${Math.floor(100 + Math.random() * 900)}`;
    const deviceKey = `px_dev_sec_${Math.random().toString(36).substring(2, 12)}${Date.now().toString(36)}`;

    const newDevice: Device = {
      device_id: deviceId,
      name: params.name,
      online: true,
      last_seen: new Date().toISOString(),
      firmware_version: 'v2.4.1',
      rssi: -65,
      config_version: 1,
      applied_config_version: 1,
      created_at: new Date().toISOString(),
      config: {
        language_a: params.language_a,
        language_b: params.language_b,
        mode: params.mode,
        voice_map: params.voice_map,
        speech_rate_pct: 100,
        volume_pct: 85,
        max_recording_sec: 15,
        heartbeat_interval_sec: 60,
      },
    };

    this.devices.unshift(newDevice);
    this.deviceKeys[deviceId] = deviceKey;
    this.commands[deviceId] = [];

    return { device: newDevice, device_key: deviceKey };
  }

  public updateDeviceConfig(id: string, config: Partial<DeviceConfig>): Device {
    const device = this.devices.find((d) => d.device_id === id);
    if (!device) throw new Error('Device not found');

    device.config = { ...device.config, ...config };
    device.config_version += 1; // Increases version; applied_config_version remains until device reports

    // Automatically simulate device acknowledging after 4 seconds
    setTimeout(() => {
      const target = this.devices.find((d) => d.device_id === id);
      if (target && target.online) {
        target.applied_config_version = target.config_version;
      }
    }, 4000);

    return device;
  }

  public rotateDeviceKey(id: string): string {
    const device = this.devices.find((d) => d.device_id === id);
    if (!device) throw new Error('Device not found');
    const newKey = `px_dev_sec_${Math.random().toString(36).substring(2, 14)}`;
    this.deviceKeys[id] = newKey;
    return newKey;
  }

  public revokeDevice(id: string): void {
    const device = this.devices.find((d) => d.device_id === id);
    if (!device) throw new Error('Device not found');
    device.online = false;
    delete this.deviceKeys[id];
  }

  public deleteDevice(id: string): void {
    this.devices = this.devices.filter((d) => d.device_id !== id);
    delete this.deviceKeys[id];
    delete this.commands[id];
  }

  public sendDeviceCommand(deviceId: string, type: CommandType): DeviceCommand {
    const device = this.devices.find((d) => d.device_id === deviceId);
    if (!device) throw new Error('Device not found');

    const cmd: DeviceCommand = {
      id: `cmd-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
      device_id: deviceId,
      type,
      status: 'pending',
      created_at: new Date().toISOString(),
      detail:
        type === 'identify'
          ? 'Identify LED signal sent'
          : type === 'sync_config'
          ? `Sync to config v${device.config_version}`
          : 'Graceful device reboot instruction',
    };

    if (!this.commands[deviceId]) this.commands[deviceId] = [];
    this.commands[deviceId].unshift(cmd);

    // Simulate device command acknowledgement and execution
    setTimeout(() => {
      cmd.status = 'delivered';
      setTimeout(() => {
        cmd.status = 'done';
        cmd.acked_at = new Date().toISOString();
        if (type === 'sync_config') {
          device.applied_config_version = device.config_version;
        } else if (type === 'reboot') {
          device.online = false;
          setTimeout(() => {
            device.online = true;
            device.last_seen = new Date().toISOString();
          }, 3500);
        }
      }, 1500);
    }, 1000);

    return cmd;
  }

  public getDeviceCommands(deviceId: string): DeviceCommand[] {
    return this.commands[deviceId] || [];
  }

  public getDeviceTelemetry(deviceId: string, timeRange: '1h' | '6h' | '24h' | '7d'): TelemetrySample[] {
    const countMap: Record<string, { count: number; intervalSec: number }> = {
      '1h': { count: 30, intervalSec: 120 },
      '6h': { count: 36, intervalSec: 600 },
      '24h': { count: 48, intervalSec: 1800 },
      '7d': { count: 56, intervalSec: 10800 },
    };

    const { count, intervalSec } = countMap[timeRange] || countMap['24h'];
    const samples: TelemetrySample[] = [];
    const now = Date.now();

    const dev = this.devices.find((d) => d.device_id === deviceId);
    const baseRssi = dev ? dev.rssi : -68;

    for (let i = count - 1; i >= 0; i--) {
      const ts = new Date(now - i * intervalSec * 1000).toISOString();
      const battery_pct = Math.max(12, Math.min(100, Math.round(98 - (i * 0.4) % 80)));
      const free_heap = Math.round(180000 + Math.sin(i / 3) * 24000);
      const rssi = Math.max(-95, Math.min(-50, baseRssi + Math.round(Math.sin(i / 2) * 6)));
      const uptime_sec = (count - i) * intervalSec + 3600;

      samples.push({ ts, rssi, free_heap, battery_pct, uptime_sec });
    }
    return samples;
  }

  // --- Utterances and Audio Processing ---
  public processUtterance(params: {
    sourceLanguage?: string;
    targetLanguage?: string;
    audioBlob?: Blob;
    deviceId?: string;
    kind?: 'utterance' | 'file';
  }): {
    job_id: string;
    id: string;
    conversation_id: string;
    source_language: string;
    detected_language: string;
    target_language: string;
    transcript: string;
    translation: string;
    can_retry: boolean;
    audio: { url: string; format: string; sample_rate: number; duration_ms: number; expires_in: number };
    timings: { stt_ms: number; translate_ms: number; synthesize_ms: number; total_ms: number };
  } {
    if (!this.settings.service_enabled) {
      const err = new Error('Service disabled');
      (err as unknown as { code: string; status: number }).code = 'service_disabled';
      (err as unknown as { code: string; status: number }).status = 503;
      throw err;
    }

    const src = params.sourceLanguage || 'en-US';
    const tgt = params.targetLanguage || 'es-ES';
    const devId = params.deviceId || 'dev-aurora-01';
    const kind = params.kind || 'utterance';

    // Demo realistic phrases based on target language
    const phraseMap: Record<string, { srcText: string; tgtText: string }> = {
      'es-ES': {
        srcText: 'Welcome! How can I assist you with your travel journey today?',
        tgtText: '¡Bienvenido! ¿Cómo puedo ayudarle con su viaje hoy?',
      },
      'fr-FR': {
        srcText: 'Good evening, your reservation has been confirmed.',
        tgtText: 'Bonsoir, votre réservation a bien été confirmée.',
      },
      'de-DE': {
        srcText: 'The morning conference will begin in the main auditorium.',
        tgtText: 'Die Morgenkonferenz beginnt im Hauptauditorium.',
      },
      'ja-JP': {
        srcText: 'Thank you for your visit, have a safe trip home.',
        tgtText: 'ご訪問いただきありがとうございます。どうぞお気をつけてお帰りください。',
      },
      'zh-CN': {
        srcText: 'Please proceed to counter number three for assistance.',
        tgtText: '请前往三号柜台寻求协助。',
      },
      'it-IT': {
        srcText: 'A table for two has been prepared by the garden terrace.',
        tgtText: 'Un tavolo per due è stato preparato vicino alla terrazza sul giardino.',
      },
    };

    const chosen = phraseMap[tgt] || {
      srcText: 'System test voice utterance captured successfully.',
      tgtText: `Traduction simulée pour la langue cible ${tgt}.`,
    };

    const jobId = `job_utt_${Date.now().toString(36)}_${Math.floor(100 + Math.random() * 900)}`;
    const convId = `conv_${devId.replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36).slice(-4)}`;

    const stt_ms = 145 + Math.floor(Math.random() * 60);
    const translate_ms = 48 + Math.floor(Math.random() * 30);
    const synthesize_ms = 95 + Math.floor(Math.random() * 45);
    const total_ms = stt_ms + translate_ms + synthesize_ms;

    const audioUrl = `https://mock.paralax.io/audio/${jobId}_translated.wav`;
    const origAudioUrl = `https://mock.paralax.io/audio/${jobId}_orig.wav`;

    const job: ApiJob = {
      job_id: jobId,
      kind,
      device_id: devId,
      conversation_id: convId,
      status: 'completed',
      source_language: src,
      detected_language: src,
      target_language: tgt,
      transcript: chosen.srcText,
      translation: chosen.tgtText,
      can_retry: true,
      original_audio_url: origAudioUrl,
      translated_audio_url: audioUrl,
      duration_sec: 3.2,
      timings: {
        stt_ms,
        translate_ms,
        synthesize_ms,
        total_ms,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.jobs.unshift(job);

    // Append to conversation
    let conversation = this.conversations.find((c) => c.conversation_id === convId);
    if (!conversation) {
      conversation = {
        conversation_id: convId,
        device_id: devId,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        turns: [],
      };
      this.conversations.unshift(conversation);
    }
    conversation.turns.push({ ...job, turn_index: conversation.turns.length + 1 });
    conversation.updated_at = new Date().toISOString();

    return {
      job_id: jobId,
      id: jobId,
      conversation_id: convId,
      source_language: src,
      detected_language: src,
      target_language: tgt,
      transcript: chosen.srcText,
      translation: chosen.tgtText,
      can_retry: true,
      audio: {
        url: audioUrl,
        format: 'audio/wav',
        sample_rate: 16000,
        duration_ms: 3200,
        expires_in: 3600,
      },
      timings: {
        stt_ms,
        translate_ms,
        synthesize_ms,
        total_ms,
      },
    };
  }

  // --- Uploads & File Jobs ---
  public createUploadUrl(filename: string, contentType: string): { job_id: string; upload_url: string; expires_in: number } {
    if (!this.settings.service_enabled) {
      const err = new Error('Service disabled');
      (err as unknown as { code: string; status: number }).code = 'service_disabled';
      (err as unknown as { code: string; status: number }).status = 503;
      throw err;
    }
    const jobId = `job_file_${Date.now().toString(36)}_${Math.floor(100 + Math.random() * 900)}`;
    const upload_url = `https://paralax-blob.vercel-storage.com/uploads/${jobId}/${filename}`;

    // Create initial queued job
    const newJob: ApiJob = {
      job_id: jobId,
      kind: 'file',
      filename,
      status: 'queued',
      source_language: 'en-US',
      target_language: 'es-ES',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.jobs.unshift(newJob);

    return { job_id: jobId, upload_url, expires_in: 900 };
  }

  public startFileJob(params: { job_id: string; source_language: string; target_language: string; voice_id?: string }): ApiJob {
    const job = this.jobs.find((j) => j.job_id === params.job_id);
    if (!job) throw new Error('Job not found');

    job.source_language = params.source_language;
    job.target_language = params.target_language;
    job.status = 'stt';
    job.updated_at = new Date().toISOString();

    // Progress through pipeline
    setTimeout(() => {
      job.status = 'translating';
      job.detected_language = job.source_language;
      job.transcript = 'This is an audio file transcription processed through the cloud batch pipeline.';
      job.updated_at = new Date().toISOString();

      setTimeout(() => {
        job.status = 'synthesizing';
        job.translation = 'Esta es una transcripción de archivo de audio procesada a través de la canalización por lotes en la nube.';
        job.updated_at = new Date().toISOString();

        setTimeout(() => {
          job.status = 'completed';
          job.duration_sec = 8.5;
          job.timings = {
            stt_ms: 1200,
            translate_ms: 220,
            synthesize_ms: 540,
            total_ms: 1960,
          };
          job.original_audio_url = `https://mock.paralax.io/audio/${job.job_id}_original.wav`;
          job.translated_audio_url = `https://mock.paralax.io/audio/${job.job_id}_translated.wav`;
          job.updated_at = new Date().toISOString();
        }, 1500);
      }, 1500);
    }, 1500);

    return job;
  }

  public getJob(id: string): ApiJob | undefined {
    return this.jobs.find((j) => j.job_id === id);
  }

  public retryJob(id: string): ApiJob {
    const job = this.jobs.find((j) => j.job_id === id);
    if (!job) throw new Error('Job not found');
    job.status = 'queued';
    delete job.error;
    job.updated_at = new Date().toISOString();

    setTimeout(() => {
      job.status = 'stt';
      setTimeout(() => {
        job.status = 'completed';
        job.transcript = 'Retried speech segment successfully recognized.';
        job.translation = 'Segmento de voz reintentado reconocido con éxito.';
        job.duration_sec = 2.8;
        job.timings = { stt_ms: 190, translate_ms: 55, synthesize_ms: 120, total_ms: 365 };
        job.original_audio_url = `https://mock.paralax.io/audio/${job.job_id}_retry.wav`;
        job.translated_audio_url = `https://mock.paralax.io/audio/${job.job_id}_retry_trans.wav`;
        job.updated_at = new Date().toISOString();
      }, 2000);
    }, 1000);

    return job;
  }

  public cancelJob(id: string): ApiJob {
    const job = this.jobs.find((j) => j.job_id === id);
    if (!job) throw new Error('Job not found');
    job.status = 'cancelled';
    job.updated_at = new Date().toISOString();
    return job;
  }

  public deleteJob(id: string): void {
    this.jobs = this.jobs.filter((j) => j.job_id !== id);
  }

  // --- Conversations ---
  public getConversations(params?: {
    deviceId?: string;
    from?: string;
    to?: string;
    cursor?: string;
    search?: string;
  }): { items: Conversation[]; next_cursor?: string } {
    let list = [...this.conversations];

    if (params?.deviceId) {
      list = list.filter((c) => c.device_id === params.deviceId);
    }
    if (params?.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (c) =>
          c.conversation_id.toLowerCase().includes(q) ||
          c.device_id.toLowerCase().includes(q) ||
          c.turns.some((t) => t.transcript?.toLowerCase().includes(q) || t.translation?.toLowerCase().includes(q))
      );
    }

    return { items: list };
  }

  public getConversation(id: string): Conversation | undefined {
    return this.conversations.find((c) => c.conversation_id === id);
  }

  // --- Stats & Overview ---
  public getStats(): AdminStats {
    const counts_by_status = {
      queued: 0,
      stt: 0,
      translating: 0,
      synthesizing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };
    const counts_by_kind = { utterance: 0, file: 0 };

    this.jobs.forEach((j) => {
      if (counts_by_status[j.status] !== undefined) counts_by_status[j.status]++;
      if (counts_by_kind[j.kind] !== undefined) counts_by_kind[j.kind]++;
    });

    const failed = counts_by_status.failed;
    const totalJobs = Math.max(1, this.jobs.length);
    const failure_rate = parseFloat(((failed / totalJobs) * 100).toFixed(1));

    // Generate 30 days of jobs per day
    const jobs_per_day: Array<{ date: string; count: number; failed: number }> = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      const count = Math.floor(180 + Math.sin(i / 3) * 60 + Math.random() * 30);
      const failCount = Math.floor(count * 0.02 + Math.random() * 2);
      jobs_per_day.push({ date: dateStr, count, failed: failCount });
    }

    const onlineDevices = this.devices.filter((d) => d.online).length;

    return {
      counts_by_status,
      counts_by_kind,
      jobs_per_day,
      failure_rate,
      devices_online: onlineDevices,
      devices_total: this.devices.length,
      top_language_pairs: [
        { pair: 'en-US → es-ES', count: 1420, percentage: 38 },
        { pair: 'es-ES → en-US', count: 1180, percentage: 32 },
        { pair: 'en-US → ja-JP', count: 540, percentage: 14 },
        { pair: 'en-US → fr-FR', count: 320, percentage: 9 },
        { pair: 'de-DE → en-US', count: 260, percentage: 7 },
      ],
      total_audio_minutes: 1845,
      utterances_today: 489,
      jobs_in_progress: (counts_by_status.queued || 0) + (counts_by_status.stt || 0) + (counts_by_status.translating || 0) + (counts_by_status.synthesizing || 0),
      latency: {
        total: { p50: 345, p95: 580 },
        stt: { p50: 175, p95: 290 },
        translate: { p50: 55, p95: 95 },
        synthesize: { p50: 115, p95: 195 },
      },
    };
  }

  // --- Health ---
  public getHealth(): SystemHealth {
    const nowIso = new Date().toISOString();
    return {
      services: [
        { name: 'Groq (Whisper STT)', status: 'healthy', checked_at: nowIso, latency_ms: 38 },
        { name: 'Groq (Llama Translation)', status: 'healthy', checked_at: nowIso, latency_ms: 28 },
        { name: 'Microsoft Edge (ReadAloud TTS)', status: 'healthy', checked_at: nowIso, latency_ms: 32 },
        { name: 'Upstash Redis', status: 'healthy', checked_at: nowIso, latency_ms: 15 },
        { name: 'Neon Postgres', status: 'healthy', checked_at: nowIso, latency_ms: 22 },
      ],
      offline_devices: this.devices.filter((d) => !d.online),
      recent_failures: this.jobs.filter((j) => j.status === 'failed').slice(0, 20),
    };
  }

  // --- API Keys ---
  public createApiKey(name: string): { key: ApiKey; secret: string } {
    const generatedSecretKey = `px_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    const prefix = generatedSecretKey.slice(0, 11);
    const newKey: ApiKey = {
      id: `key_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`,
      name,
      key_prefix: prefix,
      created_at: new Date().toISOString(),
      status: 'active',
    };
    this.apiKeys.unshift(newKey);
    return { key: newKey, secret: generatedSecretKey };
  }

  public revokeApiKey(id: string): void {
    const target = this.apiKeys.find((k) => k.id === id);
    if (target) {
      target.status = 'revoked';
    }
  }

  public deleteApiKey(id: string): void {
    this.apiKeys = this.apiKeys.filter((k) => k.id !== id);
  }
}

export const mockBackend = new MockBackendState();
