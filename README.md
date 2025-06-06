# delphi README

> **NOTE**: This extension was only built to meet my own demand, and published on the off-chance that it might help someone else. There is now over 5K installations however, and I assume most needs are not met for Delphi development at the current state of the extension. Thus, **I encourage you to open a PR for any features you might miss**. I will hapily review and add any improvements or features.

Delphi extension to allow full developer tooling for Delphi in VSCode.

## Features

- Building and running projects
- Syntax highlighting
- LSP Integration
- Snippets

## Requirements

- Delphi 11 installed
- Project LSP config generated with Delphi
  - In Delphi: Tools > Options > User Interface > Editor > Language (pick Delphi from the dropdown ) > Code Insight and turn on ‘Generate LSP Config’, and close and reopen your project.

## Extension Settings

* `delphi.bin` Path to delphi `bin` folder. Defaults to newest installation.
* `delphi.serverType` Defines the operation mode
* `delphi.agentCount` Defines the number of sub processes (agents) when serverType is controller. If agentCount > 1 then one process will be dedicated to Error Insight
* `delphi.logModes` Bit mask defining logging modes [1 (RawInputMessage), 2 (RawOutputMessage), 4 (Queue), 8 (Processor), 16 (Server), 32 (AgentFacade), 64 (DCC related), 128 (LSP Inspector traces)]
* `delphi.configFile` File URI of current LSP config (.delphilsp.json)


## Release Notes

Check out [CHANGELOG](./CHANGELOG.md).

## Some credits

- [Pascal for VSCode](https://github.com/alefragnani/vscode-language-pascal/blob/master/snippets/pascal.json)
  - Copied syntax & snippets from here.
- [DelphiLSP for VSCode](https://marketplace.visualstudio.com/items?itemName=EmbarcaderoTechnologies.delphilsp)
  - "Reverse engineered" (opened the extension with 7-Zip) some of the code for handling the custom notifications that are needed to be sent to the LSP.
