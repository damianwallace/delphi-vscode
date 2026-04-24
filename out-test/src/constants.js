"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LSP_BIN = exports.DELPHI_BIN_PATH = void 0;
const path = require("path");
const fileUtils_1 = require("./utils/fileUtils");
const PROGRAM_FILES_X86 = process.env['ProgramFiles(x86)'];
const RAD_STUDIO_VERSIONS_DIR = path.join(PROGRAM_FILES_X86, 'Embarcadero', 'Studio');
const RAD_STUDIO_VERSION = (0, fileUtils_1.highestVersion)(RAD_STUDIO_VERSIONS_DIR);
const BDS_PATH = path.join(RAD_STUDIO_VERSIONS_DIR, RAD_STUDIO_VERSION.toString());
const DELPHI_BIN_PATH = path.join(BDS_PATH, 'bin');
exports.DELPHI_BIN_PATH = DELPHI_BIN_PATH;
const LSP_BIN = 'DelphiLSP.exe';
exports.LSP_BIN = LSP_BIN;
//# sourceMappingURL=constants.js.map