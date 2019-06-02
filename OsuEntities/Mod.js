class Mod
{
    constructor()
    {
        this.None           = 0;
        this.NoFail         = 1;  // 1 << 0
        this.Easy           = 2;  // 1 << 1
        this.TouchDevice    = 4;  // 1 << 2
        this.Hidden         = 8;  // 1 << 3
        this.HardRock       = 16; // 1 << 4
        this.SuddenDeath    = 32; // 1 << 5
        this.DoubleTime     = 64; // 1 << 6
        this.Relax          = 128;// 1 << 7
        this.HalfTime       = 256;// 1 << 8
        this.Nightcore      = 512; // Only set along with DoubleTime. i.e: NC only gives 576
        this.Flashlight     = 1024;
        this.Autoplay       = 2048;
        this.SpunOut        = 4096;
        this.Relax2         = 8192;	// Autopilot
        this.Perfect        = 16384; // Only set along with SuddenDeath. i.e: PF only gives 16416  
        this.Key4           = 32768;
        this.Key5           = 65536;
        this.Key6           = 131072;
        this.Key7           = 262144;
        this.Key8           = 524288;
        this.FadeIn         = 1048576;
        this.Random         = 2097152;
        this.Cinema         = 4194304;
        this.Target         = 8388608;
        this.Key9           = 16777216;
        this.KeyCoop        = 33554432;
        this.Key1           = 67108864;
        this.Key3           = 134217728;
        this.Key2           = 268435456;
        this.ScoreV2        = 536870912;
        this.LastMod        = 1073741824;
        this.KeyMod = this.Key1 | this.Key2 | this.Key3 | this.Key4 | this.Key5 | this.Key6 | this.Key7 | this.Key8 | this.Key9 | this.KeyCoop;
        this.FreeModAllowed = this.NoFail | this.Easy | this.Hidden | this.HardRock | this.SuddenDeath | this.Flashlight | this.FadeIn | this.Relax | this.Relax2 | this.SpunOut | this.KeyMod;
        this.ScoreIncreaseMods = this.Hidden | this.HardRock | this.DoubleTime | this.Flashlight | this.FadeIn;
    }

    /**
     * Converts a bitwise mod number to its string form
     * @param {Number} bitwise The bitwise representation of the mods used
     * @returns {String} The two-character string for each mod represented
     */
    modBitwiseToString(bitwise)
    {
        let modstr = "";
        if (bitwise & this.Easy)
            modstr += "EZ";
        if (bitwise & this.Hidden)
            modstr += "HD";
        if (bitwise & this.HardRock)
            modstr += "HR";
        if (bitwise & this.DoubleTime)
            modstr += "DT";
        if (bitwise & this.HalfTime)
            modstr += "HT";
        if (modstr === "")
            modstr = "NoMod";
        return modstr;
    }
}

module.exports = Mod;