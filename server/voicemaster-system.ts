import { 
  Client, GuildMember, VoiceChannel, ChannelType, PermissionFlagsBits, 
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, 
  TextInputBuilder, TextInputStyle, CategoryChannel, MessageFlags, SlashCommandBuilder
} from 'discord.js';
import { storage } from './storage';

export class VoicemasterSystem {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  public async setupVoiceStateHandler() {
    this.client.on('voiceStateUpdate', async (oldState, newState) => {
      // Handle join-to-create functionality
      await this.handleJoinToCreate(oldState, newState);
      
      // Handle temp channel cleanup
      await this.handleTempChannelCleanup(oldState, newState);
    });
  }

  private async handleJoinToCreate(oldState: any, newState: any) {
    if (!newState.channel) return;

    const serverId = newState.guild.id;
    const config = await storage.getVoicemasterConfig(serverId);
    
    if (!config || !config.isEnabled || !config.joinToCreateChannelId) return;
    
    // Check if user joined the join-to-create channel
    if (newState.channelId === config.joinToCreateChannelId) {
      await this.createTempChannel(newState.member, config);
    }
  }

  private async handleTempChannelCleanup(oldState: any, newState: any) {
    if (!oldState.channel) return;

    const serverId = oldState.guild.id;
    const channelId = oldState.channelId;

    // Check if this is a temp channel and if it's now empty
    const tempChannel = await storage.getVoicemasterChannel(channelId);
    if (!tempChannel) return;

    const channel = oldState.channel as VoiceChannel;
    if (channel.members.size === 0) {
      // Delete empty temp channel
      try {
        await channel.delete('Empty voicemaster channel cleanup');
        await storage.deleteVoicemasterChannel(channelId);
      } catch (error) {
        console.error('Failed to delete empty voicemaster channel:', error);
      }
    }
  }

  private async createTempChannel(member: GuildMember, config: any) {
    try {
      const guild = member.guild;
      const category = config.categoryId ? guild.channels.cache.get(config.categoryId) as CategoryChannel : null;
      
      // Generate channel name
      const channelName = config.defaultChannelName.replace('{username}', member.displayName);
      
      // Create the voice channel
      const tempChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: category,
        userLimit: config.defaultUserLimit || 0,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak
            ],
          },
          {
            id: guild.roles.everyone.id,
            allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
          },
        ],
      });

      // Save to database
      await storage.createVoicemasterChannel({
        serverId: guild.id,
        channelId: tempChannel.id,
        ownerId: member.id,
        ownerUsername: member.displayName,
        channelName: channelName,
        userLimit: config.defaultUserLimit || 0,
        isLocked: false,
        allowedUsers: [],
        bannedUsers: []
      });

      // Move user to new channel
      await member.voice.setChannel(tempChannel);

      // Send voicemaster control panel
      await this.sendVoicemasterControls(tempChannel, member);

    } catch (error) {
      console.error('Failed to create temp channel:', error);
    }
  }

  public async sendVoicemasterControls(channel: VoiceChannel, owner: GuildMember) {
    const embed = new EmbedBuilder()
      .setTitle('🎙️ Voicemaster Controls')
      .setDescription(`**${owner.displayName}** owns this voice channel!\nUse the buttons below to manage your channel.`)
      .addFields([
        { name: '🔒 Lock/Unlock', value: 'Control who can join', inline: true },
        { name: '👥 Set Limit', value: 'Set user limit (0-99)', inline: true },
        { name: '📝 Rename', value: 'Change channel name', inline: true },
        { name: '➕ Invite User', value: 'Allow specific user to join', inline: true },
        { name: '🚫 Kick User', value: 'Remove user from channel', inline: true },
        { name: '👑 Transfer', value: 'Give ownership to another user', inline: true }
      ])
      .setColor(0x5865F2)
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`vm_lock_${channel.id}`)
          .setLabel('🔒 Lock')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`vm_unlock_${channel.id}`)
          .setLabel('🔓 Unlock')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`vm_limit_${channel.id}`)
          .setLabel('👥 Set Limit')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`vm_rename_${channel.id}`)
          .setLabel('📝 Rename')
          .setStyle(ButtonStyle.Primary)
      );

    const row2 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`vm_invite_${channel.id}`)
          .setLabel('➕ Invite')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`vm_kick_${channel.id}`)
          .setLabel('🚫 Kick')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`vm_transfer_${channel.id}`)
          .setLabel('👑 Transfer')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`vm_info_${channel.id}`)
          .setLabel('ℹ️ Info')
          .setStyle(ButtonStyle.Secondary)
      );

    try {
      // Send to the text channel (find general or first available)
      const textChannel = channel.guild.channels.cache
        .filter(ch => ch.type === ChannelType.GuildText)
        .find(ch => ch.name.includes('general')) || 
        channel.guild.channels.cache
        .filter(ch => ch.type === ChannelType.GuildText)
        .first();

      if (textChannel && textChannel.isTextBased()) {
        await textChannel.send({
          content: `<@${owner.id}>`,
          embeds: [embed],
          components: [row1, row2]
        });
      }
    } catch (error) {
      console.error('Failed to send voicemaster controls:', error);
    }
  }

  public async handleVoicemasterButton(interaction: any) {
    const customId = interaction.customId;
    const [action, , channelId] = customId.split('_');
    
    // Get channel data
    const tempChannel = await storage.getVoicemasterChannel(channelId);
    if (!tempChannel) {
      return await interaction.reply({
        content: '❌ This voicemaster channel no longer exists.',
        flags: MessageFlags.Ephemeral
      });
    }

    // Check if user is the owner
    if (interaction.user.id !== tempChannel.ownerId) {
      return await interaction.reply({
        content: '❌ Only the channel owner can use these controls.',
        flags: MessageFlags.Ephemeral
      });
    }

    const channel = interaction.guild.channels.cache.get(channelId) as VoiceChannel;
    if (!channel) {
      return await interaction.reply({
        content: '❌ Voice channel not found.',
        flags: MessageFlags.Ephemeral
      });
    }

    switch (action) {
      case 'lock':
        await this.lockChannel(interaction, channel, tempChannel);
        break;
      case 'unlock':
        await this.unlockChannel(interaction, channel, tempChannel);
        break;
      case 'limit':
        await this.showLimitModal(interaction, channel);
        break;
      case 'rename':
        await this.showRenameModal(interaction, channel);
        break;
      case 'invite':
        await this.showInviteModal(interaction, channel);
        break;
      case 'kick':
        await this.showKickModal(interaction, channel);
        break;
      case 'transfer':
        await this.showTransferModal(interaction, channel);
        break;
      case 'info':
        await this.showChannelInfo(interaction, channel, tempChannel);
        break;
    }
  }

  private async lockChannel(interaction: any, channel: VoiceChannel, tempChannel: any) {
    try {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        Connect: false
      });

      await storage.updateVoicemasterChannel(channel.id, { isLocked: true });

      await interaction.reply({
        content: '🔒 Channel locked! Only you and invited users can join.',
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: '❌ Failed to lock channel.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  private async unlockChannel(interaction: any, channel: VoiceChannel, tempChannel: any) {
    try {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        Connect: true
      });

      await storage.updateVoicemasterChannel(channel.id, { isLocked: false });

      await interaction.reply({
        content: '🔓 Channel unlocked! Everyone can join now.',
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: '❌ Failed to unlock channel.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  private async showLimitModal(interaction: any, channel: VoiceChannel) {
    const modal = new ModalBuilder()
      .setCustomId(`vm_limit_modal_${channel.id}`)
      .setTitle('Set User Limit');

    const limitInput = new TextInputBuilder()
      .setCustomId('limit')
      .setLabel('User Limit (0-99, 0 = no limit)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter number...')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(2);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(limitInput));
    await interaction.showModal(modal);
  }

  private async showRenameModal(interaction: any, channel: VoiceChannel) {
    const modal = new ModalBuilder()
      .setCustomId(`vm_rename_modal_${channel.id}`)
      .setTitle('Rename Channel');

    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('New Channel Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter new name...')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(100);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));
    await interaction.showModal(modal);
  }

  private async showInviteModal(interaction: any, channel: VoiceChannel) {
    const modal = new ModalBuilder()
      .setCustomId(`vm_invite_modal_${channel.id}`)
      .setTitle('Invite User');

    const userInput = new TextInputBuilder()
      .setCustomId('user')
      .setLabel('User ID or @mention')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter user ID or mention...')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(userInput));
    await interaction.showModal(modal);
  }

  private async showKickModal(interaction: any, channel: VoiceChannel) {
    const modal = new ModalBuilder()
      .setCustomId(`vm_kick_modal_${channel.id}`)
      .setTitle('Kick User');

    const userInput = new TextInputBuilder()
      .setCustomId('user')
      .setLabel('User ID or @mention')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter user ID or mention...')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(userInput));
    await interaction.showModal(modal);
  }

  private async showTransferModal(interaction: any, channel: VoiceChannel) {
    const modal = new ModalBuilder()
      .setCustomId(`vm_transfer_modal_${channel.id}`)
      .setTitle('Transfer Ownership');

    const userInput = new TextInputBuilder()
      .setCustomId('user')
      .setLabel('New Owner (User ID or @mention)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter user ID or mention...')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(userInput));
    await interaction.showModal(modal);
  }

  private async showChannelInfo(interaction: any, channel: VoiceChannel, tempChannel: any) {
    const embed = new EmbedBuilder()
      .setTitle('🎙️ Channel Information')
      .addFields([
        { name: '📛 Name', value: channel.name, inline: true },
        { name: '👑 Owner', value: `<@${tempChannel.ownerId}>`, inline: true },
        { name: '👥 User Limit', value: tempChannel.userLimit === 0 ? 'No limit' : `${tempChannel.userLimit}`, inline: true },
        { name: '🔒 Status', value: tempChannel.isLocked ? 'Locked' : 'Unlocked', inline: true },
        { name: '👤 Current Users', value: `${channel.members.size}`, inline: true },
        { name: '🕒 Created', value: `<t:${Math.floor(new Date(tempChannel.createdAt).getTime() / 1000)}:R>`, inline: true }
      ])
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }

  public async handleVoicemasterModal(interaction: any) {
    const customId = interaction.customId;
    const [, action, , channelId] = customId.split('_');
    
    const channel = interaction.guild.channels.cache.get(channelId) as VoiceChannel;
    if (!channel) {
      return await interaction.reply({
        content: '❌ Voice channel not found.',
        flags: MessageFlags.Ephemeral
      });
    }

    switch (action) {
      case 'limit':
        await this.handleLimitModal(interaction, channel);
        break;
      case 'rename':
        await this.handleRenameModal(interaction, channel);
        break;
      case 'invite':
        await this.handleInviteModal(interaction, channel);
        break;
      case 'kick':
        await this.handleKickModal(interaction, channel);
        break;
      case 'transfer':
        await this.handleTransferModal(interaction, channel);
        break;
    }
  }

  private async handleLimitModal(interaction: any, channel: VoiceChannel) {
    const limit = parseInt(interaction.fields.getTextInputValue('limit'));
    
    if (isNaN(limit) || limit < 0 || limit > 99) {
      return await interaction.reply({
        content: '❌ Invalid limit. Please enter a number between 0-99.',
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      await channel.setUserLimit(limit);
      await storage.updateVoicemasterChannel(channel.id, { userLimit: limit });

      await interaction.reply({
        content: `👥 User limit set to ${limit === 0 ? 'no limit' : limit}.`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: '❌ Failed to set user limit.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  private async handleRenameModal(interaction: any, channel: VoiceChannel) {
    const newName = interaction.fields.getTextInputValue('name').trim();
    
    if (!newName || newName.length > 100) {
      return await interaction.reply({
        content: '❌ Invalid name. Please enter a valid name (1-100 characters).',
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      await channel.setName(newName);
      await storage.updateVoicemasterChannel(channel.id, { channelName: newName });

      await interaction.reply({
        content: `📝 Channel renamed to "${newName}".`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: '❌ Failed to rename channel.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  private async handleInviteModal(interaction: any, channel: VoiceChannel) {
    const userInput = interaction.fields.getTextInputValue('user').trim();
    const userId = userInput.replace(/[<@!>]/g, '');

    try {
      const member = await interaction.guild.members.fetch(userId);
      
      await channel.permissionOverwrites.edit(member.user, {
        Connect: true,
        Speak: true
      });

      const tempChannel = await storage.getVoicemasterChannel(channel.id);
      const allowedUsers = [...(Array.isArray(tempChannel?.allowedUsers) ? tempChannel.allowedUsers : []), userId];
      await storage.updateVoicemasterChannel(channel.id, { allowedUsers });

      await interaction.reply({
        content: `➕ Invited ${member.displayName} to join your channel.`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: '❌ Failed to invite user. Make sure the user ID is correct.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  private async handleKickModal(interaction: any, channel: VoiceChannel) {
    const userInput = interaction.fields.getTextInputValue('user').trim();
    const userId = userInput.replace(/[<@!>]/g, '');

    try {
      const member = await interaction.guild.members.fetch(userId);
      
      if (member.voice.channelId === channel.id) {
        await member.voice.disconnect('Kicked by channel owner');
      }

      await channel.permissionOverwrites.edit(member.user, {
        Connect: false
      });

      const tempChannel = await storage.getVoicemasterChannel(channel.id);
      const bannedUsers = [...(Array.isArray(tempChannel?.bannedUsers) ? tempChannel.bannedUsers : []), userId];
      await storage.updateVoicemasterChannel(channel.id, { bannedUsers });

      await interaction.reply({
        content: `🚫 Kicked ${member.displayName} from your channel.`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: '❌ Failed to kick user. Make sure the user ID is correct.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  private async handleTransferModal(interaction: any, channel: VoiceChannel) {
    const userInput = interaction.fields.getTextInputValue('user').trim();
    const userId = userInput.replace(/[<@!>]/g, '');

    try {
      const member = await interaction.guild.members.fetch(userId);
      
      // Remove old owner permissions
      await channel.permissionOverwrites.edit(interaction.user, {
        ManageChannels: false,
        MoveMembers: false
      });

      // Give new owner permissions
      await channel.permissionOverwrites.edit(member.user, {
        ManageChannels: true,
        MoveMembers: true,
        Connect: true,
        Speak: true
      });

      await storage.updateVoicemasterChannel(channel.id, { 
        ownerId: userId,
        ownerUsername: member.displayName 
      });

      await interaction.reply({
        content: `👑 Transferred ownership to ${member.displayName}.`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: '❌ Failed to transfer ownership. Make sure the user ID is correct.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  // Create the voicemaster command
  public createVoicemasterCommand() {
    return {
      data: new SlashCommandBuilder()
        .setName('voicemaster')
        .setDescription('🎙️ Voicemaster system - manage voice channels')
        .addSubcommand(subcommand =>
          subcommand
            .setName('setup')
            .setDescription('Set up join-to-create voice channels')
            .addChannelOption(option =>
              option.setName('category')
                .setDescription('The category to create voice channels in')
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('config')
            .setDescription('Configure voicemaster settings')
            .addStringOption(option =>
              option.setName('setting')
                .setDescription('Setting to configure')
                .setRequired(true)
                .addChoices(
                  { name: 'Default Channel Name', value: 'name' },
                  { name: 'Default User Limit', value: 'limit' },
                  { name: 'Auto Delete Time', value: 'delete_time' }
                ))
            .addStringOption(option =>
              option.setName('value')
                .setDescription('New value for the setting')
                .setRequired(true))),
      async execute(interaction: any) {
        // This will be handled by the main bot's command handler
        await interaction.reply({ content: 'Voicemaster command executed!', ephemeral: true });
      }
    };
  }
}