enum Mods {
    None           = 0,
    NoFail         = 1 << 0,
    Easy           = 1 << 1,
    TouchDevice    = 1 << 2,
    Hidden         = 1 << 3,
    HardRock       = 1 << 4,
    SuddenDeath    = 1 << 5,
    DoubleTime     = 1 << 6,
    Relax          = 1 << 7,
    HalfTime       = 1 << 8,
    Nightcore      = 1 << 9,  // Only set along with DoubleTime. i.e: NC only gives 576
    Flashlight     = 1 << 10,
    Autoplay       = 1 << 11,
    SpunOut        = 1 << 12,
    Relax2         = 1 << 13, // Autopilot
    Perfect        = 1 << 14, // Only set along with SuddenDeath. i.e: PF only gives 16416  
    Key4           = 1 << 15,
    Key5           = 1 << 16,
    Key6           = 1 << 17,
    Key7           = 1 << 18,
    Key8           = 1 << 19,
    FadeIn         = 1 << 20,
    Random         = 1 << 21,
    Cinema         = 1 << 22,
    Target         = 1 << 23,
    Key9           = 1 << 24,
    KeyCoop        = 1 << 25,
    Key1           = 1 << 26,
    Key3           = 1 << 27,
    Key2           = 1 << 28,
    ScoreV2        = 1 << 29,
    Mirror         = 1 << 30,
    KeyMod = Key1 | Key2 | Key3 | Key4 | Key5 | Key6 | Key7 | Key8 | Key9 | KeyCoop,
    FreeModAllowed = NoFail | Easy | Hidden | HardRock | SuddenDeath | Flashlight | FadeIn | Relax | Relax2 | SpunOut | KeyMod,
    ScoreIncreaseMods = Hidden | HardRock | DoubleTime | Flashlight | FadeIn,
    DifficultyMods = Easy | HardRock | DoubleTime | HalfTime
};

export default Mods;
