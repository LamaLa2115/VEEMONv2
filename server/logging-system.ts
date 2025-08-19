import { 
  Client, GuildMember, Message, VoiceState, GuildAuditLogsEntry, 
  EmbedBuilder, TextChannel, ChannelType, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder,
  TextInputBuilder, TextInputStyle, MessageFlags, AuditLogEvent
} from 'discord.js';
import { storage } from './storage';

export class LoggingSystem {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  public async setupEventHandlers() {
    // Message logging
    this.client.on('messageCreate', async (message) => {
      await this.logMessage(message, 'sent');
    });

    this.client.on('messageUpdate', async (oldMessage, newMessage) => {
      if (newMessage.partial || oldMessage.partial) return;
      await this.logMessageEdit(oldMessage as Message, newMessage as Message);
    });

    this.client.on('messageDelete', async (message) => {
      if (message.partial) return;
      await this.logMessage(message as Message, 'deleted');
    });

    // Voice logging
    this.client.on('voiceStateUpdate', async (oldState, newState) => {
      await this.logVoiceActivity(oldState, newState);
    });

    // Member logging
    this.client.on('guildMemberAdd', async (member) => {
      if (member.partial) return;
      await this.logMemberActivity(member, 'join');
    });

    this.client.on('guildMemberRemove', async (member) => {
      if (member.partial) return;
      await this.logMemberActivity(member, 'leave');
    });

    this.client.on('guildMemberUpdate', async (oldMember, newMember) => {
      await this.logMemberUpdate(oldMember, newMember);
    });

    // Server/Channel logging
    this.client.on('channelCreate', async (channel) => {
      const channelName = 'name' in channel ? channel.name || 'Unknown' : 'Unknown';
      await this.logServerActivity('channel_create', channel.id, channelName, null, null);
    });

    this.client.on('channelDelete', async (channel) => {
      await this.logServerActivity('channel_delete', channel.id, channel.name || 'Unknown', null, null);
    });

    this.client.on('roleCreate', async (role) => {
      await this.logServerActivity('role_create', role.id, role.name, null, null);
    });

    this.client.on('roleDelete', async (role) => {
      await this.logServerActivity('role_delete', role.id, role.name, null, null);
    });
  }

  private async logMessage(message: Message, action: 'sent' | 'deleted') {
    if (!message.guild || message.author.bot) return;

    const config = await storage.getLoggingConfig(message.guild.id);
    if (!config || !config.isMessageLogEnabled || !config.messageLogChannelId) return;

    try {
      await storage.createMessageLog({
        serverId: message.guild.id,
        messageId: message.id,
        authorId: message.author.id,
        authorUsername: message.author.displayName,
        channelId: message.channel.id,
        channelName: (message.channel as TextChannel).name || 'Unknown',
        content: message.content || null,
        attachments: message.attachments.map(att => att.url),
        action: action
      });

      const logChannel = message.guild.channels.cache.get(config.messageLogChannelId) as TextChannel;
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle(`📝 Message ${action === 'sent' ? 'Sent' : 'Deleted'}`)
          .addFields([
            { name: '👤 Author', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
            { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
            { name: '🆔 Message ID', value: message.id, inline: true }
          ])
          .setColor(action === 'sent' ? 0x00ff00 : 0xff0000)
          .setTimestamp();

        if (message.content) {
          embed.addFields([{ name: '💬 Content', value: message.content.slice(0, 1024) }]);
        }

        if (message.attachments.size > 0) {
          embed.addFields([{ 
            name: '📎 Attachments', 
            value: message.attachments.map(att => `[${att.name}](${att.url})`).join('\n').slice(0, 1024) 
          }]);
        }

        await logChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Failed to log message:', error);
    }
  }

  private async logMessageEdit(oldMessage: Message, newMessage: Message) {
    if (!newMessage.guild || newMessage.author.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const config = await storage.getLoggingConfig(newMessage.guild.id);
    if (!config || !config.isMessageLogEnabled || !config.messageLogChannelId) return;

    try {
      await storage.createMessageLog({
        serverId: newMessage.guild.id,
        messageId: newMessage.id,
        authorId: newMessage.author.id,
        authorUsername: newMessage.author.displayName,
        channelId: newMessage.channel.id,
        channelName: (newMessage.channel as TextChannel).name || 'Unknown',
        content: newMessage.content || null,
        attachments: newMessage.attachments.map(att => att.url),
        action: 'edited',
        oldContent: oldMessage.content || null
      });

      const logChannel = newMessage.guild.channels.cache.get(config.messageLogChannelId) as TextChannel;
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('✏️ Message Edited')
          .addFields([
            { name: '👤 Author', value: `<@${newMessage.author.id}> (${newMessage.author.tag})`, inline: true },
            { name: '📍 Channel', value: `<#${newMessage.channel.id}>`, inline: true },
            { name: '🆔 Message ID', value: newMessage.id, inline: true }
          ])
          .setColor(0xffa500)
          .setTimestamp();

        if (oldMessage.content) {
          embed.addFields([{ name: '📝 Before', value: oldMessage.content.slice(0, 1024) }]);
        }

        if (newMessage.content) {
          embed.addFields([{ name: '📝 After', value: newMessage.content.slice(0, 1024) }]);
        }

        await logChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Failed to log message edit:', error);
    }
  }

  private async logVoiceActivity(oldState: VoiceState, newState: VoiceState) {
    if (!newState.guild) return;

    const config = await storage.getLoggingConfig(newState.guild.id);
    if (!config || !config.isVoiceLogEnabled || !config.voiceLogChannelId) return;

    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    let action = '';
    let channelId = null;
    let channelName = null;
    let oldChannelId = null;
    let oldChannelName = null;

    // Determine action
    if (!oldState.channel && newState.channel) {
      action = 'join';
      channelId = newState.channel.id;
      channelName = newState.channel.name;
    } else if (oldState.channel && !newState.channel) {
      action = 'leave';
      channelId = oldState.channel.id;
      channelName = oldState.channel.name;
    } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
      action = 'move';
      channelId = newState.channel.id;
      channelName = newState.channel.name;
      oldChannelId = oldState.channel.id;
      oldChannelName = oldState.channel.name;
    } else if (oldState.mute !== newState.mute) {
      action = newState.mute ? 'mute' : 'unmute';
      channelId = newState.channel?.id || null;
      channelName = newState.channel?.name || null;
    } else if (oldState.deaf !== newState.deaf) {
      action = newState.deaf ? 'deafen' : 'undeafen';
      channelId = newState.channel?.id || null;
      channelName = newState.channel?.name || null;
    }

    if (!action) return;

    try {
      await storage.createVoiceLog({
        serverId: newState.guild.id,
        userId: member.id,
        username: member.displayName,
        channelId,
        channelName,
        action,
        oldChannelId,
        oldChannelName
      });

      const logChannel = newState.guild.channels.cache.get(config.voiceLogChannelId) as TextChannel;
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle(`🎙️ Voice ${action.charAt(0).toUpperCase() + action.slice(1)}`)
          .addFields([
            { name: '👤 User', value: `<@${member.id}> (${member.user.tag})`, inline: true }
          ])
          .setColor(0x5865f2)
          .setTimestamp();

        if (action === 'move') {
          embed.addFields([
            { name: '📤 From', value: `${oldChannelName}`, inline: true },
            { name: '📥 To', value: `${channelName}`, inline: true }
          ]);
        } else if (channelName) {
          embed.addFields([{ name: '📍 Channel', value: channelName, inline: true }]);
        }

        await logChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Failed to log voice activity:', error);
    }
  }

  private async logMemberActivity(member: GuildMember, action: 'join' | 'leave') {
    if (!member.guild || member.user.bot) return;

    const config = await storage.getLoggingConfig(member.guild.id);
    if (!config || !config.isMemberLogEnabled || !config.memberLogChannelId) return;

    try {
      await storage.createMemberLog({
        serverId: member.guild.id,
        userId: member.id,
        username: member.displayName,
        discriminator: member.user.discriminator,
        action,
        oldValue: null,
        newValue: null,
        details: {}
      });

      const logChannel = member.guild.channels.cache.get(config.memberLogChannelId) as TextChannel;
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle(`👥 Member ${action === 'join' ? 'Joined' : 'Left'}`)
          .addFields([
            { name: '👤 User', value: `<@${member.id}> (${member.user.tag})`, inline: true },
            { name: '🆔 User ID', value: member.id, inline: true },
            { name: '📅 Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
          ])
          .setColor(action === 'join' ? 0x00ff00 : 0xff0000)
          .setTimestamp();

        if (action === 'join' && member.joinedTimestamp) {
          embed.addFields([{ name: '📥 Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true }]);
        }

        await logChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Failed to log member activity:', error);
    }
  }

  private async logMemberUpdate(oldMember: GuildMember, newMember: GuildMember) {
    if (!newMember.guild || newMember.user.bot) return;

    const config = await storage.getLoggingConfig(newMember.guild.id);
    if (!config || !config.isMemberLogEnabled || !config.memberLogChannelId) return;

    const logChannel = newMember.guild.channels.cache.get(config.memberLogChannelId) as TextChannel;
    if (!logChannel) return;

    try {
      // Nickname change
      if (oldMember.nickname !== newMember.nickname) {
        await storage.createMemberLog({
          serverId: newMember.guild.id,
          userId: newMember.id,
          username: newMember.displayName,
          discriminator: newMember.user.discriminator,
          action: 'nickname_change',
          oldValue: oldMember.nickname || oldMember.user.username,
          newValue: newMember.nickname || newMember.user.username,
          details: {}
        });

        const embed = new EmbedBuilder()
          .setTitle('📝 Nickname Changed')
          .addFields([
            { name: '👤 User', value: `<@${newMember.id}> (${newMember.user.tag})`, inline: true },
            { name: '📝 Before', value: oldMember.nickname || oldMember.user.username, inline: true },
            { name: '📝 After', value: newMember.nickname || newMember.user.username, inline: true }
          ])
          .setColor(0xffa500)
          .setTimestamp();

        await logChannel.send({ embeds: [embed] });
      }

      // Role changes
      const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
      const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

      for (const role of addedRoles.values()) {
        await storage.createMemberLog({
          serverId: newMember.guild.id,
          userId: newMember.id,
          username: newMember.displayName,
          discriminator: newMember.user.discriminator,
          action: 'role_add',
          oldValue: null,
          newValue: role.name,
          details: { roleId: role.id }
        });

        const embed = new EmbedBuilder()
          .setTitle('🎭 Role Added')
          .addFields([
            { name: '👤 User', value: `<@${newMember.id}> (${newMember.user.tag})`, inline: true },
            { name: '🎭 Role', value: `<@&${role.id}> (${role.name})`, inline: true }
          ])
          .setColor(0x00ff00)
          .setTimestamp();

        await logChannel.send({ embeds: [embed] });
      }

      for (const role of removedRoles.values()) {
        await storage.createMemberLog({
          serverId: newMember.guild.id,
          userId: newMember.id,
          username: newMember.displayName,
          discriminator: newMember.user.discriminator,
          action: 'role_remove',
          oldValue: role.name,
          newValue: null,
          details: { roleId: role.id }
        });

        const embed = new EmbedBuilder()
          .setTitle('🎭 Role Removed')
          .addFields([
            { name: '👤 User', value: `<@${newMember.id}> (${newMember.user.tag})`, inline: true },
            { name: '🎭 Role', value: `${role.name}`, inline: true }
          ])
          .setColor(0xff0000)
          .setTimestamp();

        await logChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Failed to log member update:', error);
    }
  }

  private async logServerActivity(action: string, targetId: string, targetName: string, executorId: string | null, executorUsername: string | null) {
    // Implementation for server activity logging
    // This would be called by various server events
  }

  public async createLoggingCommand() {
    return {
      data: {
        name: 'logging',
        description: 'Configure server logging system',
        options: [
          {
            name: 'setup',
            description: 'Set up logging channels and configuration',
            type: 1 // SUB_COMMAND
          },
          {
            name: 'enable',
            description: 'Enable specific logging features',
            type: 1,
            options: [
              {
                name: 'feature',
                description: 'Logging feature to enable',
                type: 3, // STRING
                required: true,
                choices: [
                  { name: 'Message Logging', value: 'message' },
                  { name: 'Voice Logging', value: 'voice' },
                  { name: 'Member Logging', value: 'member' },
                  { name: 'Moderation Logging', value: 'moderation' },
                  { name: 'Audit Logging', value: 'audit' },
                  { name: 'Server Logging', value: 'server' },
                  { name: 'All Features', value: 'all' }
                ]
              }
            ]
          },
          {
            name: 'disable',
            description: 'Disable specific logging features',
            type: 1,
            options: [
              {
                name: 'feature',
                description: 'Logging feature to disable',
                type: 3,
                required: true,
                choices: [
                  { name: 'Message Logging', value: 'message' },
                  { name: 'Voice Logging', value: 'voice' },
                  { name: 'Member Logging', value: 'member' },
                  { name: 'Moderation Logging', value: 'moderation' },
                  { name: 'Audit Logging', value: 'audit' },
                  { name: 'Server Logging', value: 'server' },
                  { name: 'All Features', value: 'all' }
                ]
              }
            ]
          },
          {
            name: 'channels',
            description: 'Configure logging channels',
            type: 1
          },
          {
            name: 'status',
            description: 'Show current logging configuration',
            type: 1
          }
        ]
      },
      execute: async (interaction: any) => {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
          case 'setup':
            await this.handleLoggingSetup(interaction);
            break;
          case 'enable':
            await this.handleLoggingToggle(interaction, true);
            break;
          case 'disable':
            await this.handleLoggingToggle(interaction, false);
            break;
          case 'channels':
            await this.handleLoggingChannels(interaction);
            break;
          case 'status':
            await this.handleLoggingStatus(interaction);
            break;
        }
      }
    };
  }

  private async handleLoggingSetup(interaction: any) {
    const embed = new EmbedBuilder()
      .setTitle('📊 Logging System Setup')
      .setDescription('Click the buttons below to configure your logging system.')
      .addFields([
        { name: '🎛️ Auto-Setup', value: 'Automatically create all logging channels', inline: true },
        { name: '⚙️ Manual Setup', value: 'Configure channels manually', inline: true },
        { name: '📊 View Status', value: 'Check current configuration', inline: true }
      ])
      .setColor(0x5865f2);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('logging_auto_setup')
          .setLabel('🚀 Auto Setup')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('logging_manual_setup')
          .setLabel('⚙️ Manual Setup')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('logging_status')
          .setLabel('📊 Status')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({ embeds: [embed], components: [row] });
  }

  private async handleLoggingToggle(interaction: any, enable: boolean) {
    const feature = interaction.options.getString('feature');
    const guildId = interaction.guild.id;

    try {
      let config = await storage.getLoggingConfig(guildId);
      if (!config) {
        config = await storage.createLoggingConfig({
          serverId: guildId,
          messageLogChannelId: null,
          voiceLogChannelId: null,
          memberLogChannelId: null,
          moderationLogChannelId: null,
          auditLogChannelId: null,
          serverLogChannelId: null,
          isMessageLogEnabled: false,
          isVoiceLogEnabled: false,
          isMemberLogEnabled: false,
          isModerationLogEnabled: false,
          isAuditLogEnabled: false,
          isServerLogEnabled: false
        });
      }

      const updateData: any = {};

      if (feature === 'all') {
        updateData.isMessageLogEnabled = enable;
        updateData.isVoiceLogEnabled = enable;
        updateData.isMemberLogEnabled = enable;
        updateData.isModerationLogEnabled = enable;
        updateData.isAuditLogEnabled = enable;
        updateData.isServerLogEnabled = enable;
      } else {
        const featureMap: any = {
          message: 'isMessageLogEnabled',
          voice: 'isVoiceLogEnabled',
          member: 'isMemberLogEnabled',
          moderation: 'isModerationLogEnabled',
          audit: 'isAuditLogEnabled',
          server: 'isServerLogEnabled'
        };
        updateData[featureMap[feature]] = enable;
      }

      await storage.updateLoggingConfig(guildId, updateData);

      await interaction.reply({
        content: `✅ ${feature === 'all' ? 'All logging features' : feature + ' logging'} ${enable ? 'enabled' : 'disabled'}!`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: '❌ Failed to update logging configuration.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  private async handleLoggingChannels(interaction: any) {
    const embed = new EmbedBuilder()
      .setTitle('📝 Configure Logging Channels')
      .setDescription('Set up different channels for different types of logs.')
      .setColor(0x5865f2);

    const row1 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('set_message_log_channel')
          .setLabel('📝 Message Log')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('set_voice_log_channel')
          .setLabel('🎙️ Voice Log')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('set_member_log_channel')
          .setLabel('👥 Member Log')
          .setStyle(ButtonStyle.Primary)
      );

    const row2 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('set_moderation_log_channel')
          .setLabel('🛡️ Moderation Log')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('set_audit_log_channel')
          .setLabel('📊 Audit Log')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('set_server_log_channel')
          .setLabel('🏛️ Server Log')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.reply({ embeds: [embed], components: [row1, row2] });
  }

  private async handleLoggingStatus(interaction: any) {
    const config = await storage.getLoggingConfig(interaction.guild.id);
    
    const embed = new EmbedBuilder()
      .setTitle('📊 Logging System Status')
      .setColor(0x5865f2);

    if (!config) {
      embed.setDescription('❌ Logging system is not configured yet. Use `/logging setup` to get started.');
    } else {
      const features = [
        { name: '📝 Message Logging', enabled: config.isMessageLogEnabled, channel: config.messageLogChannelId },
        { name: '🎙️ Voice Logging', enabled: config.isVoiceLogEnabled, channel: config.voiceLogChannelId },
        { name: '👥 Member Logging', enabled: config.isMemberLogEnabled, channel: config.memberLogChannelId },
        { name: '🛡️ Moderation Logging', enabled: config.isModerationLogEnabled, channel: config.moderationLogChannelId },
        { name: '📊 Audit Logging', enabled: config.isAuditLogEnabled, channel: config.auditLogChannelId },
        { name: '🏛️ Server Logging', enabled: config.isServerLogEnabled, channel: config.serverLogChannelId }
      ];

      for (const feature of features) {
        const status = feature.enabled ? '✅ Enabled' : '❌ Disabled';
        const channel = feature.channel ? `<#${feature.channel}>` : 'Not set';
        embed.addFields([{ name: feature.name, value: `${status}\nChannel: ${channel}`, inline: true }]);
      }
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  public async handleLoggingButton(interaction: any) {
    const customId = interaction.customId;

    if (customId === 'logging_auto_setup') {
      await this.autoSetupChannels(interaction);
    } else if (customId === 'logging_manual_setup') {
      await this.handleLoggingChannels(interaction);
    } else if (customId === 'logging_status') {
      await this.handleLoggingStatus(interaction);
    } else if (customId.startsWith('set_')) {
      await this.showChannelSelectionModal(interaction, customId);
    }
  }

  private async autoSetupChannels(interaction: any) {
    try {
      const guild = interaction.guild;
      
      // Create logging category
      const category = await guild.channels.create({
        name: '📊-logging',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
          },
        ],
      });

      // Create individual log channels
      const channels = await Promise.all([
        guild.channels.create({
          name: 'message-logs',
          type: ChannelType.GuildText,
          parent: category,
        }),
        guild.channels.create({
          name: 'voice-logs',
          type: ChannelType.GuildText,
          parent: category,
        }),
        guild.channels.create({
          name: 'member-logs',
          type: ChannelType.GuildText,
          parent: category,
        }),
        guild.channels.create({
          name: 'moderation-logs',
          type: ChannelType.GuildText,
          parent: category,
        }),
        guild.channels.create({
          name: 'audit-logs',
          type: ChannelType.GuildText,
          parent: category,
        }),
        guild.channels.create({
          name: 'server-logs',
          type: ChannelType.GuildText,
          parent: category,
        }),
      ]);

      const [messageLog, voiceLog, memberLog, moderationLog, auditLog, serverLog] = channels;

      // Update database configuration
      await storage.createLoggingConfig({
        serverId: guild.id,
        messageLogChannelId: messageLog.id,
        voiceLogChannelId: voiceLog.id,
        memberLogChannelId: memberLog.id,
        moderationLogChannelId: moderationLog.id,
        auditLogChannelId: auditLog.id,
        serverLogChannelId: serverLog.id,
        isMessageLogEnabled: true,
        isVoiceLogEnabled: true,
        isMemberLogEnabled: true,
        isModerationLogEnabled: true,
        isAuditLogEnabled: true,
        isServerLogEnabled: true
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Auto Setup Complete!')
        .setDescription('All logging channels have been created and configured.')
        .addFields([
          { name: '📝 Message Logs', value: `<#${messageLog.id}>`, inline: true },
          { name: '🎙️ Voice Logs', value: `<#${voiceLog.id}>`, inline: true },
          { name: '👥 Member Logs', value: `<#${memberLog.id}>`, inline: true },
          { name: '🛡️ Moderation Logs', value: `<#${moderationLog.id}>`, inline: true },
          { name: '📊 Audit Logs', value: `<#${auditLog.id}>`, inline: true },
          { name: '🏛️ Server Logs', value: `<#${serverLog.id}>`, inline: true }
        ])
        .setColor(0x00ff00);

      await interaction.update({ embeds: [embed], components: [] });
    } catch (error) {
      await interaction.update({
        content: '❌ Failed to auto-setup logging channels. Please check bot permissions.',
        embeds: [],
        components: []
      });
    }
  }

  private async showChannelSelectionModal(interaction: any, customId: string) {
    const modal = new ModalBuilder()
      .setCustomId(`channel_modal_${customId}`)
      .setTitle('Set Logging Channel');

    const channelInput = new TextInputBuilder()
      .setCustomId('channel')
      .setLabel('Channel ID or #mention')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter channel ID or mention...')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(channelInput));
    await interaction.showModal(modal);
  }
}