const ISA_CPU15 = {
    "NOP": "0000",
    "ADD": "0001",
    "SUB": "0010",
    "AND": "0011",
    "OR" : "0100",
    "SL" : "0101",
    "SR" : "0110",
    "SRA": "0111",
    "LDL": "1000",
    "LDH": "1001",
    "CMP": "1010",
    "JE" : "1011",
    "JMP": "1100",
    "LD" : "1101",
    "ST" : "1110",
    "HLT": "1111",
};

const ISA_MAX_CPU = {
  "NOP": "00000",
  "MOV": "00001",
  "MOVL": "00010",
  "MOVH": "00011",
  "LD": "00100",
  "ST": "00101",
  "PUSH": "00110",
  "POP": "00111",
  "ADD": "01000",
  "ADDL": "01001",
  "ADDH": "01010",
  "SUB": "01011",
  "SUBL": "01100",
  "SUBH": "01101",
  "AND": "01110",
  "OR": "01111",
  "XOR": "10000",
  "LSL": "10001",
  "LSR": "10010",
  "ASR": "10011",
  "ADC": "10100",
  "SBC": "10101",
  "NEG": "10110",
  "CMP": "10111",
  "BREQ": "11000",
  "BRMI": "11001",
  "BRCA": "11010",
  "BROV": "11011",
  "JUMP": "11100",
  "CALL": "11101",
  "RET": "11110",
  "HLT": "11111"
};

const DEFAULT_ASM = [
    "; solve sum(-5 ~ 10)",
    "mov Reg0, $0",
    ";mov Reg1, $1",
    "movh Reg2, #00",
    "movl Reg2, 5",
    "neg REg2",
    "st reg2, 64",
    "movh Reg3, 0",
    "movl Reg3, 10",
    "LOOP:",
    "st  Reg0, 64",
    "add Reg0, Reg2",
    "add Reg2, $1",
    "cmp Reg2, Reg3",
    "breq  EXIT",
    "jump LOOP",
    "EXIT: hlt",
];

const EXPLANATION = [
    'アセンブリに使用可能な表現は以下の通りです．',
    '大文字・小文字は区別しません．',
    '@ 命令語群で定義されたニーモニック (ex. NOP)',
    '@ 汎用レジスタ: REG0-REG7',
    '@ 真値',
    ' -> 符号付き10進表現 (ex. 64, -10)',
    ' -> 2進表現 (ex. B10101010)',
    ' -> 16進表現 (ex. #FF)',
    '@ ラベル表記 (ex. LOOP1:)',
    '@ \';\'以降の記述はすべてコメントとして除外'
]

let opcodes = ISA_CPU15;  // set ISA

let ARCH_BITS = (Object.values(opcodes)[0].length == 5)? 16 : 15;
const REG_BITS = 3;
const IMMEDIATE_BITS = 8;

let binaryList = [];

const instArea = document.getElementById("inst-input");
const asmArea = document.getElementById("asm-input");
const binArea = document.getElementById("bin-output");
const hexArea = document.getElementById("hex-output");

const checkEnableArray = document.getElementById("enable-array");
const checkEnableComment = document.getElementById("enable-comment");
const checkEnableMIF = document.getElementById("enable-mif");
const numberWords = document.getElementById("n-words");


window.onload = () => {
    //-- set file api
    document.getElementById("formFile").addEventListener("change", async function () {
        const [file] = this.files;
        if (!file) return;

        const text = await file.text();
        loadOpcodes(text);
    });

    //-- set initial values
    const INST_LIST = Object.entries(opcodes).map(kv => kv.join(","));
    // for (const key in opcodes) {
    //     // if (Object.prototype.hasOwnProperty.call(DEFAULT_INST, key)) {
    //         INST_LIST.push();
    //     //}
    // }
    instArea.value = INST_LIST.join("\n");
    
    // document.getElementById("btn-show-sample").onclick = function () {
    asmArea.value = DEFAULT_ASM.join("\n");
    assemble();
    // }
    
    //-- set listeners
    asmArea.oninput = assemble;
    checkEnableArray.onclick = assemble;
    checkEnableComment.onclick = assemble;
    checkEnableMIF.onclick = assemble;

    instArea.onchange = () => loadOpcodes(instArea.value);
    numberWords.onchange = showBinary;

    // for all textarea, turn off auto complete & add copy function
    [instArea, asmArea, binArea, hexArea].forEach((element) => {
        element.autocomplete = "off";

        if (navigator.clipboard) {
            const btn = document.createElement("button");
            btn.classList.add("btn", "btn-sm", "btn-secondary");
            btn.textContent = "Copy";
            btn.onclick = () => {
                const txt = element.value;
                if (txt) {
                    navigator.clipboard.writeText(txt);
                    btn.textContent = "Copied!";
                    setTimeout(() => {btn.textContent = "Copy"}, 1500);
                }
            };
            element.after(btn);
        }
        else
            console.warn("Unable to access Clipboard API.");
    });
    
    document.getElementById("btn-show-formats").onclick = () => alert(
        EXPLANATION.join("\n")
    );

    // force input[number] to inc/dec with doubled value
    numberWords.addEventListener('keydown', function(event) {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            // prevent +/- 1
            event.preventDefault();
            const val = parseInt(numberWords.value);

            if (event.key === "ArrowUp" && val < 2 ** 8)
                numberWords.value = val*2;
            else if (event.key === "ArrowDown" && val > 2)
                numberWords.value = val/2;
        }
    });
}


function loadOpcodes(text) {
    const inst = {};
    let opBits = 0;
    const lines = readLines(text);
    for (const line of lines) {
        if (line == "") continue;

        const cols = line.trim().split(",");
        if (cols.length != 2) {
            instArea.focus();
            alert("命令語エラー: 命令語の定義はニーモニックとオペコードのみを記述してください");
            return;
        }
        
        const mnemonic = cols[0].trim();
        const opcode = cols[1].trim();
        if (! /^[01]+$/.test(opcode) ) {
            instArea.focus();
            alert("命令セットエラー: 2進値でないオペコードがあります(全角数字は非対応です)");
            return;
        }
        if ( opcode.length < 4 || opcode.length > 5 ) {
            instArea.focus();
            alert("命令セットエラー: オペコードは4bitまたは5bitで定義してください");
            return;
        }

        if (opBits == 0)
            opBits = opcode.length;
        else if (opBits != opcode.length){
            instArea.focus();
            alert("命令セットエラー: オペコードのビット数が混在しています");
            return;
        }

        inst[mnemonic] = opcode;
    }

    opcodes = inst;
    ARCH_BITS = (opBits==4)? 15 : 16;
    instArea.value = lines.join("\n");

    assemble();
}

function assemble() {
    showBinary();
    showHEX();
}

function showBinary() {
    binaryList = asm2binary( readLines(asmArea.value) );

    let output = (checkEnableArray.checked)? bin2VHDLArray(binaryList) : binaryList;
    // if (output.length > 255)
    //     alert("[Warning] 命令数が256を超えているため，ボード上での動作を保証できません．")

    binArea.value = output.join("\n");
}

function showHEX() {
    let showOutput = true;
    let output = binaryList.map(bin => {
        // bin = bin.trim();
        if (bin.length == 0)
            return "";
        else if (/^[0,1]+$/.test(bin))
            return parseInt(bin, 2).toString(16).toUpperCase().padStart(Math.ceil(bin.length / 4), "0");
        else if (bin.startsWith("[")) {
            showOutput = false;
            return bin;
        }
        else
            return "[invalid binary]";
    });

    if (checkEnableMIF.checked)
        output = hex2MIF(output);

    hexArea.value = showOutput? output.join("\n") : "バイナリエラー";
}

function asm2binary(asmList) {
    let count = 0;      // program_counter
    const labels = {};  // name: line-no.

    // remove all comments
    asmList = asmList.map((asm) => {
        return asm.split(";")[0];
    });

    // search and remove all label definitions
    asmList = asmList.map((asm) => {
        asm = asm.trim();

        // cut and checks label difinition
        if (asm.includes(":")) {
            const list = asm.split(":");
            if (list.length > 2)
                return "[too many \":\"]";

            const labelName = list[0].trim();
            asm = list[1];
            
            if (labelName in opcodes)
                return `[invalid label ${labelName} (same as operation)]`;
            else if (/REG[0-7]/.test(labelName))
                return `[invalid label ${labelName} (same as REGISTER)]`;
            else if (/^[0-9]+$/.test(labelName))
                return `[invalid label ${labelName} (should be a string, not number)]`;
            
            labels[labelName] = count.toString();
        }

        if ( asm != "" ) count++;

        return asm;
    });
    
    // return assembled biniaries
    return asmList.map((asm) => {
        // never assemble error messages
        if (asm.startsWith("["))
            return asm;

        let binary = "";
        asm = asm.trim();
        if (asm == "")
            return binary;
        
        // split operands
        const tokenList = splitAsm( asm );
        if (tokenList.length > 3) {
            return "[too many operands]"
        }

        // opcode
        const operation = tokenList[0];
        if ( !(operation in opcodes) )
            return `[invalid operation ${operation}]`;
        binary += opcodes[operation];

        // op1: REG_N or IMMEDIATE
        let operand = (tokenList[1] in labels)? labels[tokenList[1]] : tokenList[1];
        if (operand) {
            try {
                let binToken = asmOperand2bin(operand);
                if (binToken.length == IMMEDIATE_BITS)
                    binary += "000";
                binary += binToken;
            } catch (e) {
                return e.message;
            }
        }

        // op2: REG_B or CONST_REG or IMMEDIATE, none if op2 is IMMEDIATE
        operand = (tokenList[2] in labels)? labels[tokenList[2]] : tokenList[2];
        if (operand) {
            try {
                if (/^\$[0,1]$/.test(operand)) {  // const operand $0, $1
                    // binary += "".padEnd(3, operand[1]);
                    binary += "00" + operand[1];
                    binary = binary.padEnd(ARCH_BITS, 1);
                }
                else {
                    binary += asmOperand2bin(operand);
                }
            } catch (e) {
                return e.message;
            }
        }

        binary = binary.padEnd(ARCH_BITS, "0");
        // never shown, i hope...
        // if (binary.length != ARCH_BITS)
        //     return "[several immediate values]";

        return binary;
    });
}

function asmOperand2bin(operand) {
    if (operand.startsWith("REG")) {  // REG0-7
        if (/^REG[0-7]$/.test(operand)) {
            const REGN = operand[operand.length - 1];
            return parseInt(REGN).toString(2).padStart(REG_BITS, "0");
        }
        else
            throw new Error(`[${operand} out of index]`);
    }
    else {  // IMMEDIATE VALUE
        const MAX = 2 ** IMMEDIATE_BITS - 1;
        const MIN = -(MAX/2 + 1);
        const value_error = new Error(`[value ${operand} out of 8bit range]`);
        // HEX
        if (/^#[0-9,A-F]+$/.test(operand)) {
            const hexVal = parseInt("0x" + operand.slice(1));
            if (hexVal > MAX)
                throw value_error;
            
            return hexVal.toString(2).padStart(IMMEDIATE_BITS, "0");
        }
        // BINARY(~8bit)
        else if (/^B[0-1]+$/.test(operand)) {
            const binVal = operand.slice(1);
            if (binVal.length > 8)
                throw value_error;
            
            return binVal.padStart(IMMEDIATE_BITS, "0");
        }
        // DECIMAL(+/-)
        else if (/^-?[0-9]+$/.test(operand) ) {
            let decVal = parseInt(operand);
            if ( decVal < MIN || decVal > MAX )
                throw value_error;
            
            if ( decVal < 0 ) {
                decVal = MAX + 1 + decVal;
            }
            return decVal.toString(2).padStart(IMMEDIATE_BITS, "0");
        }
        // others
        else
            throw new Error(`[invalid token ${operand}]`);
    }
}

// "00...00",  -- source
function bin2VHDLArray(binList) {
    const showComments = checkEnableComment.checked;
    const asmLines = (showComments)? readLines(asmArea.value) : null;
    const ARRAY_SIZE = parseInt(numberWords.value);

    let count = 0;
    let array = binList.map((line, index) => {
            if (line.startsWith("["))
                return line
            else if (line === "")
                // return (checkEnableComment.checked && asmLines[index] != "")? `-- ${asmLines[index]}` : ""
                return ""

            line = `"${line}"`;
            if (count < ARRAY_SIZE - 1)
                line += ",";
            if (checkEnableComment.checked)
                line += ` -- [${count++}] ${asmLines[index]}`
            
            return line;
        })
        // skip empty lines
        .filter(line => line);


    // extend array size
    if (ARRAY_SIZE && array.length < ARRAY_SIZE) {
        array.length = ARRAY_SIZE;
    }
    // fill extended elements
    for (let i = count; i < array.length; i++) {
        const splitter = (i === array.length - 1)? " " : ",";
        array[i] = `"${"0".repeat(ARCH_BITS)}"${splitter} -- [${i}]`;
    }

    return array;
}

function hex2MIF(hexList) {
    // WIDTH=16;
    // DEPTH=256;
    // ADDRESS_RADIX=DEC;
    // DATA_RADIX=HEX;
    // CONTENT BEGIN
    //     0   : 4800;
    // ...
    //    15   : 0000;
    // [16..255] : 0000;
    // END;

    const header = [
        `WIDTH = ${ARCH_BITS};`,
        "DEPTH = 255;",
        "ADDRESS_RADIX = DEC;",
        "DATA_RADIX = HEX;",
        "CONTENT BEGIN"
    ];

    let output = [];
    let i = 0;
    const mifList = [];
    hexList.forEach((line) => {
        if (line != "")
            mifList.push(`\t${i++}\t: ${line};`)
    });
    const footer = [
        `[${mifList.length}..255]\t: 0000;`,
        "END;"
    ];
    return output.concat( header, mifList, footer );
}

function readLines(string) { return string.toUpperCase().split(/\r?\n|\r/); }

function splitAsm(asmString) { return asmString.replaceAll(",", " ").split(/\s+/).map(asm => asm.trim()) }

