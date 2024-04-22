# fattennwjs
Executable Relases
https://github.com/MikalDev/fattennwjs/releases

 Fatten C3 nwjs mac files from a x86 nwjs app and a arm nwjs (when exporting from C3 export both Intel and ARM versions of nwjs and do _not_ package the files.)

Mac x86 executables: [Releases](https://github.com/MikalDev/fattennwjs/releases) 

fattennwjs --arm mac64-arm --intel mac64 --sign "MoonstoneTest"

Options:
      --version  Show version number                                   [boolean]
      --arm      Path to the ARM directory                   [string] [required]
      --intel    Path to the Intel directory                 [string] [required]
      --preview  Preview the files that will change                    [boolean]
      --sign     codesign the app directory with <keyName>              [string]
  -h, --help     Show help                                             [boolean]

Fattens up a NW.js app by using an arm and intel version of the app and optionally signs
