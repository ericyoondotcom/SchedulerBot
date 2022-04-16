const Discord = require("discord.js");
const chrono = require("chrono-node");
const moment = require("moment");
const schedule = require("node-schedule");

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = "game ";
const REACTION_EMOJI = "🙋";

let scheduledEvents = [];

const bot = new Discord.Client();
bot.login(TOKEN);

bot.on("ready", async () => {
    console.log("Bot running!");
});

bot.on("message", async (msg) => {
    if(!msg.cleanContent.startsWith("game ")) return;
    if(msg.channel.guild == null) return;
    const cmd = parseCommand(msg.cleanContent.substring(PREFIX.length).trim());
    console.log(cmd);
    executeCommand(cmd, msg);
});

bot.on("messageReactionAdd", async (reaction, user) => {
    if(user.bot) return;
    if(reaction.emoji.name != REACTION_EMOJI) return;
    const event = scheduledEvents.find(i => reaction.message.id == i.msgId);
    if(event == undefined) return;
    const member = reaction.message.guild.member(user);
    if(member == null) return;
    if(event.signups.includes(user.id)) return;
    
    if(event.signups.length >= event.maxPlayers && event.maxPlayers != 0){
        reaction.users.remove(user);
        const embed = new Discord.MessageEmbed()
            .setColor("#ff4f4f")
            .setTitle("Could not sign up")
            .setDescription(`The event ${event.name} is already at a maximum of ${event.maxPlayers} signups.`);
        user.send({embed: embed});
        return;
    }
    event.signups.push(user.id);
    const role = await reaction.message.guild.roles.fetch(event.role);
    member.roles.add(role);

    const embed = new Discord.MessageEmbed()
        .setColor("#9cffc0")
        .setTitle(`Signed up for event ${event.name}!`)
        .setDescription(`We'll notify you when the event starts on ${moment(event.time).format("ddd, MMM D [at] h:mma")}.`);
    user.send({embed: embed});
    return;
});

bot.on("messageReactionRemove", async (reaction, user) => {
    if(user.bot) return;
    if(reaction.emoji.name != REACTION_EMOJI) return;
    const event = scheduledEvents.find(i => reaction.message.id == i.msgId);
    if(event == undefined) return;
    const member = reaction.message.guild.member(user);
    if(member == null) return;
    const i = event.signups.indexOf(user.id);
    if(i < 0) return;
    event.signups.splice(i, 1);
    const role = await reaction.message.guild.roles.fetch(event.role);
    member.roles.remove(role);

    const embed = new Discord.MessageEmbed()
        .setColor("#ffff9c")
        .setTitle(`Unregistered for ${event.name}!`)
        .setDescription(`You've been removed from the event.`);
    user.send({embed: embed});
});

bot.on("messageDelete", async (message) => {
    const eventIdx = scheduledEvents.findIndex(i => message.id == i.msgId);
    const event = scheduledEvents[eventIdx];
    if(event == undefined) return;
    event.scheduleJob.cancel();
    const role = await message.guild.roles.fetch(event.role);
    role.delete();

    const embed = new Discord.MessageEmbed()
        .setColor("#ff4f4f")
        .setTitle("Canceled: " + event.name)
        .setDescription("The event previously scheduled for " + moment(event.time).format("ddd, MMM D [at] h:mma") + " has been canceled.");
    message.channel.send({
        embed: embed,
        content: `<@&${event.role}> **${event.name}** has been canceled!`
    });
    event.signups.forEach((userId) => {
        message.guild.members.fetch(userId).then(member => {
            member.send({embed: embed});
        });
    });
    scheduledEvents.splice(eventIdx, 1);
})

function parseCommand(text){
    const splitBySpaces = text.split(" ");
    if(splitBySpaces.length == 0) return null;
    const command = splitBySpaces[0];
    let argsString = text.substring(command.length).trim();
    const args = {};
    while(argsString.length > 0){
        let delimiterIdx = argsString.indexOf(" ");
        let dashIdx = argsString.indexOf("--");
        if(dashIdx == -1) break;
        const arg = argsString.substring(dashIdx + 2, delimiterIdx == -1 ? argsString.length : delimiterIdx);
        let val;
        if(delimiterIdx == -1){
            val = "";
            argsString = "";
        }else{
            const tempValString = argsString.substring(delimiterIdx + 1);
            const nextDashIdx = tempValString.indexOf("--");
            val = tempValString.substring(0, nextDashIdx < 0 ? tempValString.length : nextDashIdx);
            argsString = argsString.substring(delimiterIdx + 1 + val.length);
        }
        args[arg] = val.trim();
    }

    return {command, args};
}

async function executeCommand(cmd, msg){
    switch(cmd.command){
        case "create": { // game create --name Event Name --time Tomorrow at 5pm --minplayers 3 --maxplayers 5
            if(!("name" in cmd.args)){
                msg.channel.send("🤡 Missing argument: --name");
                return;
            }
            const name = cmd.args.name.replace(/amongus|among us/g, "amogus");
            if(!("time" in cmd.args)){
                msg.channel.send("🤡 Missing argument: --time");
                return;
            }
            const parsedTime = chrono.parseDate(cmd.args.time);
            if(parsedTime == null){
                msg.channel.send("🤡 Invalid start time. Use natural language, e.g. \"Tomorrow at 5:30pm\"");
                return;
            }
            if(parsedTime.getTime() < Date.now()){
                msg.channel.send("🤡 The time specified is in the past!");
                return;
            }
            let minPlayers = 0;
            if("minplayers" in cmd.args){
                minPlayers = parseInt(cmd.args.minplayers, 10);
                if(isNaN(minPlayers)) minPlayers = 0;
            }
            let maxPlayers = 0;
            if("maxplayers" in cmd.args){
                maxPlayers = parseInt(cmd.args.maxplayers, 10);
                if(isNaN(maxPlayers)) maxPlayers = 0;
            }
            if(minPlayers > maxPlayers && maxPlayers != 0){
                msg.channel.send("😔 Bestie, max players can't be greater than min players!");
                return;
            }
            const embed = new Discord.MessageEmbed()
                .setColor("#9cffc0")
                .setTitle(name)
                .setDescription("React with " + REACTION_EMOJI + " to sign up!")
                .addField("Starts at", moment(parsedTime).format("ddd, MMM D [at] h:mma"))
                .setFooter(`Created by ${msg.author.username} | Delete this message to cancel`, msg.author.displayAvatarURL());
            const mentionsArray = msg.mentions.roles.array();
            let mentionsString = "";
            if(mentionsArray.length > 0){
                for(let i of mentionsArray){
                    mentionsString += `<@&${i.id}>`;
                }
            }
            if(minPlayers > 0){
                embed.addField("Min. players to start", minPlayers, true);
            }
            if(maxPlayers > 0){
                embed.addField("Max players", maxPlayers, true);
            }
            const newRole = await msg.guild.roles.create({
                data: {
                    name: "Signups: " + name,
                    mentionable: true
                }
            });
            const job = schedule.scheduleJob(parsedTime, () => {
                onEventStart(sentMessage.id, msg.channel);
            });
            const sentMessage = await msg.channel.send({embed: embed, content: mentionsString});
            sentMessage.react(REACTION_EMOJI);
            scheduledEvents.push({
                name: name,
                time: parsedTime,
                minPlayers,
                maxPlayers,
                msgId: sentMessage.id,
                signups: [],
                role: newRole.id,
                scheduleJob: job,
                createdBy: msg.author.id
            });
            msg.delete();
            break;
        }
        default: {
            msg.channel.send("🤡 Bestie, that's not a valid command!");
            return;
        }
    }
}

async function onEventStart(msgId, channel){
    const eventIdx = scheduledEvents.findIndex(i => msgId == i.msgId);
    if(eventIdx == -1) return;
    const event = scheduledEvents[eventIdx];

    if(event.signups.length >= event.minPlayers){
        const eventCreator = await channel.guild.members.fetch(event.createdBy);
        const promises = [];
        event.signups.forEach((userId) => {
            promises.push(channel.guild.members.fetch(userId));
        });
        const settled = await Promise.allSettled(promises);
        let playersString = "";
        for(let i of settled){
            if(i.status == "fulfilled"){
                if(playersString.length != 0) playersString += ", ";
                playersString += i.value.displayName;
            }
        }
        const embed = new Discord.MessageEmbed()
            .setColor("#ab9cff")
            .setTitle("Starting: " + event.name)
            .addField("Starts at", moment(event.time).format("ddd, MMM D [at] h:mma"), false)
            .addField("Signups", event.maxPlayers == 0 ? event.signups.length.toString() : `${event.signups.length} / ${event.maxPlayers}`, true)
            .addField("Players", playersString, true)
            .setFooter(`Created by ${eventCreator.user.username}`, eventCreator.user.displayAvatarURL());
        await channel.send({
            embed: embed,
            content: `<@&${event.role}> **${event.name}** is starting!`
        });
        for(let i of settled){
            if(i.status == "fulfilled") i.value.send({embed: embed});
        }
    } else {
        const embed = new Discord.MessageEmbed()
            .setColor("#ff4f4f")
            .setTitle("Not enough signups: " + event.name)
            .setDescription("Not enough signups to start! The event previously scheduled for " + moment(event.time).format("ddd, MMM D [at] h:mma") + " has been canceled.");
        await channel.send({
            embed: embed,
            content: `<@&${event.role}> **${event.name}** has been canceled!`
        });
        event.signups.forEach((userId) => {
            channel.guild.members.fetch(userId).then(member => {
                member.send({embed: embed});
            });
        });
    }
    const role = await channel.guild.roles.fetch(event.role);
    // role.delete();
    scheduledEvents.splice(eventIdx, 1);
}
