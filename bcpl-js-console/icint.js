const fs = require('fs');
const path = require('path');

// Constants
const ASC_TAB = 8;
const ASC_LF = 10;
const ASC_FF = 12;
const ASC_CR = 13;
const ASC_SPACE = 32;
const ASC_DOLLAR = 36;
const ASC_PERCENT = 37;
const ASC_PLUS = 43;
const ASC_MINUS = 45;
const ASC_SLASH = 47;

const ASC_0 = 48;
const ASC_9 = 57;
const ASC_A = 65;
const ASC_Z = 90;

const ASC_L = 76;
const ASC_S = 83;
const ASC_J = 74;
const ASC_T = 84;
const ASC_F = 70;
const ASC_K = 75;
const ASC_X = 88;
const ASC_C = 67;
const ASC_D = 68;
const ASC_G = 71;
const ASC_I = 73;
const ASC_P = 80;
const ASC_O = 79;
const ASC_N = 78;

const STR_NO_INPUT = "NO INPUT";
const STR_NO_OUTPUT = "NO OUTPUT";
const STR_NO_ICFILE = "NO ICFILE";
const STR_INVALID_OPTION = "INVALID OPTION";
const STR_DUPLICATE_LABEL = "DUPLICATE LABEL";
const STR_BAD_CODE_AT_P = "BAD CODE AT P";
const STR_UNSET_LABEL = "UNSET LABEL";
const STR_BAD_CH = "BAD CH";
const STR_UNKNOWN_CALL = "UNKNOWN CALL";
const STR_UNKNOWN_EXEC = "UNKNOWN EXEC";
const STR_INTCODE_ERROR_AT_PC = "INTCODE ERROR AT PC";
const STR_USAGE = "USAGE: node icint.js ICFILE [...] [-iINPUT] [-oOUTPUT]";

const PROGSTART = 401;
const WORDCOUNT = 19900;
const LABVCOUNT = 500;

const FN_BITS = 8;
const FN_MASK = 255;
const F0_L = 0;
const F1_S = 1;
const F2_A = 2;
const F3_J = 3;
const F4_T = 4;
const F5_F = 5;
const F6_K = 6;
const F7_X = 7;
const FI_BIT = 1 << 3;
const FP_BIT = 1 << 4;
const FD_BIT = 1 << 5;

// K-codes
const K01_START = 1;
const K02_SETPM = 2;
const K03_ABORT = 3;
const K04_BACKTRACE = 4;
const K11_SELECTINPUT = 11;
const K12_SELECTOUTPUT = 12;
const K13_RDCH = 13;
const K14_WRCH = 14;
const K15_UNRDCH = 15;
const K16_INPUT = 16;
const K17_OUTPUT = 17;
const K30_STOP = 30;
const K31_LEVEL = 31;
const K32_LONGJUMP = 32;
const K34_BINWRCH = 34;
const K35_REWIND = 35;
const K40_APTOVEC = 40;
const K41_FINDOUTPUT = 41;
const K42_FINDINPUT = 42;
const K46_ENDREAD = 46;
const K47_ENDWRITE = 47;
const K60_WRITES = 60;
const K62_WRITEN = 62;
const K63_NEWLINE = 63;
const K64_NEWPAGE = 64;
const K65_WRITEO = 65;
const K66_PACKSTRING = 66;
const K67_UNPACKSTRING = 67;
const K68_WRITED = 68;
const K69_WRITEARG = 69;
const K70_READN = 70;
const K71_TERMINATOR = 71;
const K74_WRITEX = 74;
const K75_WRITEHEX = 75;
const K76_WRITEF = 76;
const K77_WRITEOCT = 77;
const K78_MAPSTORE = 78;
const K85_GETBYTE = 85;
const K86_PUTBYTE = 86;
const K87_GETVEC = 87;
const K88_FREEVEC = 88;
const K89_RANDOM = 89;
const K90_MULDIV = 90;
const K91_RESULT2 = 91;

const ENDSTREAMCH = -1;
const BYTESPERWORD = 2;

// Memory
const buffer = new ArrayBuffer(WORDCOUNT * BYTESPERWORD);
const m = new Int16Array(buffer);
const mu = new Uint16Array(buffer); // Unsigned view

let lomem = 0;
let himem = WORDCOUNT - 1;
let cis = 0;
let cos = 0;
let sysin = 0;
let sysprint = 0;

// Helper functions
function cstr(s_ptr) {
    // s_ptr is index in m (word index)
    // BCPL strings are packed: length byte, then chars.
    // But here `cstr` in C takes `char* d, byte* s`.
    // `s` is a pointer to BCPL string (length byte first).
    // In JS, we need to extract it from `m`.
    // Wait, `m` is 16-bit words.
    // `byte* s` in C means it accesses memory byte-wise.
    // In JS, we can use a DataView or Uint8Array on the buffer.
    
    // Let's create a byte view of the memory
    const memBytes = new Uint8Array(buffer);
    // s_ptr is word index, so byte index is s_ptr * 2?
    // No, in C `m` is `short*`. `byte* s` casts it.
    // If `s` comes from `m` index `v`, then byte address is `v * 2`.
    // However, BCPL pointers are usually word addresses.
    // Let's check `writef`: `byte *s = (byte*)&m[*v++]`.
    // Yes, it casts word pointer to byte pointer.
    // So if we have a word index `idx`, the byte index is `idx * 2`.
    // BUT, endianness matters!
    // C64 is Little Endian (6502).
    // x86 is Little Endian.
    // Node.js usually runs on Little Endian.
    // So `m[i]` (16-bit) consists of bytes at `2*i` and `2*i+1`.
    // `2*i` is the LSB, `2*i+1` is the MSB.
    // BCPL strings: length is the first byte.
    // If `m[i]` holds the length, is it in the LSB or MSB?
    // `(byte*)&m[i]` points to the first byte.
    // On Little Endian, that's the LSB.
    
    let byteIdx = s_ptr * 2; // Assuming s_ptr is word index
    // Wait, if s_ptr is passed as `byte*` in C, it's already a byte address?
    // No, in `writef`, `v` is `short*`. `*v` is a value (word).
    // `(byte*)&m[*v]` takes the address of `m[*v]`.
    // So `*v` is an index into `m`.
    // So yes, `idx * 2`.
    
    let len = memBytes[byteIdx];
    let str = "";
    for (let i = 0; i < len; i++) {
        str += String.fromCharCode(memBytes[byteIdx + 1 + i]);
    }
    return str;
}

function bstr(s) {
    // Converts JS string to BCPL string (packed in bytes)
    // Returns a buffer or array of bytes?
    // In C `fn2(byte*, bstr, byte*, d, char*, s)` copies to `d`.
    // We probably don't need this exact function in JS, but we might need to put strings into memory.
    // `loadcode` uses `bstr` to convert filename to BCPL string?
    // No, `loadcode` takes `char* fn` (C string) and calls `findinput(bstr(s, fn))`.
    // `findinput` takes `byte* fn` (BCPL string).
    // So we need to convert JS string to BCPL string format in a temporary buffer?
    // Or just handle JS strings in `findinput`.
    return s; // For now, let's see how we use it.
}

function decval(c) {
    if (c >= ASC_0 && c <= ASC_9) return c - ASC_0;
    if (c >= ASC_A && c <= ASC_Z) return c - ASC_A + 10;
    return 0;
}

const strdigits = "0123456789ABCDEF";

function openfile(fn, mode) {
    // fn is JS string
    if (fn.toUpperCase() === "SYSIN") return sysin;
    if (fn.toUpperCase() === "SYSPRINT") return sysprint;
    
    try {
        // mode mapping
        // O_RDONLY | O_BINARY -> 'r'
        // O_CREAT | O_WRONLY | O_TRUNC | O_BINARY -> 'w'
        // In C:
        // findinput: O_RDONLY | O_BINARY
        // findoutput: O_CREAT | O_WRONLY | O_TRUNC | O_BINARY
        
        let flags = 'r';
        if (mode === 'w') flags = 'w';
        
        try {
            const fd = fs.openSync(fn, flags);
            return fd + 1; // 1-based
        } catch (e) {
            // Try lowercase if read mode
            if (flags === 'r' && fn !== fn.toLowerCase()) {
                try {
                    const fd = fs.openSync(fn.toLowerCase(), flags);
                    return fd + 1;
                } catch (e2) {
                    return 0;
                }
            }
            return 0;
        }
    } catch (e) {
        return 0;
    }
}

function findinput(fn_bcpl) {
    // fn_bcpl is a BCPL string in memory?
    // Or we can just pass JS string if we adapt the caller.
    // The C code converts C string to BCPL string then calls findinput.
    // `findinput` calls `cstr` to convert back to C string.
    // So we can just pass JS string directly if we shortcut.
    // But `interpret` calls `findinput` with a pointer from memory (K42).
    // So we need to handle both or decode in `findinput`.
    
    let fn;
    if (typeof fn_bcpl === 'number') {
        fn = cstr(fn_bcpl);
    } else {
        fn = fn_bcpl;
    }
    return openfile(fn, 'r');
}

function findoutput(fn_bcpl) {
    let fn;
    if (typeof fn_bcpl === 'number') {
        fn = cstr(fn_bcpl);
    } else {
        fn = fn_bcpl;
    }
    return openfile(fn, 'w');
}

function endread() {
    if (cis !== sysin) {
        fs.closeSync(cis - 1);
        cis = sysin;
    }
}

function endwrite() {
    if (cos !== sysprint) {
        fs.closeSync(cos - 1);
        cos = sysprint;
    }
}

function rdch() {
    const buffer = Buffer.alloc(1);
    try {
        const bytesRead = fs.readSync(cis - 1, buffer, 0, 1, null);
        if (bytesRead !== 1) return ENDSTREAMCH;
        let c = buffer[0];
        return c === ASC_CR ? ASC_LF : c;
    } catch (e) {
        return ENDSTREAMCH;
    }
}

function wrch(c) {
    if (c === ASC_LF) {
        newline();
    } else {
        const buffer = Buffer.from([c]);
        fs.writeSync(cos - 1, buffer, 0, 1);
    }
}

function newline() {
    fs.writeSync(cos - 1, "\n");
}

function writes(s_ptr) {
    // s_ptr is word index
    const memBytes = new Uint8Array(buffer);
    let byteIdx = s_ptr * 2;
    let len = memBytes[byteIdx];
    // s++ in C means increment pointer by 1 byte?
    // No, `byte* s`. `*++s`.
    // Yes, it skips the length byte.
    for (let i = 0; i < len; i++) {
        wrch(memBytes[byteIdx + 1 + i]);
    }
}

function writed(n, d) {
    let s = Math.abs(n).toString();
    if (n < 0) s = "-" + s;
    while (s.length < d) s = " " + s;
    for (let i = 0; i < s.length; i++) {
        wrch(s.charCodeAt(i));
    }
}

function writen(n) {
    writed(n, 0);
}

function readn() {
    let sum = 0;
    let c;
    let neg = false;
    
    do {
        c = rdch();
    } while (c === ASC_SPACE || c === ASC_LF || c === ASC_TAB);
    
    if (c === ASC_MINUS) {
        neg = true;
        c = rdch();
    } else if (c === ASC_PLUS) {
        c = rdch();
    }
    
    while (c >= ASC_0 && c <= ASC_9) {
        sum = sum * 10 + (c - ASC_0);
        c = rdch();
    }
    
    m[K71_TERMINATOR] = c;
    return neg ? -sum : sum;
}

function writeoct(n, d) {
    // n is word (unsigned)
    if (d > 1) writeoct(n >>> 3, d - 1);
    wrch(strdigits.charCodeAt(n & 7));
}

function writehex(n, d) {
    if (d > 1) writehex(n >>> 4, d - 1);
    wrch(strdigits.charCodeAt(n & 15));
}

function writef(v_ptr) {
    // v_ptr is word index into m
    // byte *s = (byte*)&m[*v++], ss = 1;
    // m[v_ptr] is the format string pointer (word index)
    // v_ptr increments after fetching format string pointer.
    
    let fmt_ptr = m[v_ptr++]; // The format string address
    const memBytes = new Uint8Array(buffer);
    let byteIdx = fmt_ptr * 2;
    let len = memBytes[byteIdx];
    let ss = 1;
    
    while (ss <= len) {
        let c = memBytes[byteIdx + ss++];
        if (c !== ASC_PERCENT) {
            wrch(c);
        } else {
            c = memBytes[byteIdx + ss++];
            switch (c) {
                default: wrch(c); break;
                case ASC_S: writes(m[v_ptr++]); break;
                case ASC_C: wrch(m[v_ptr++]); break;
                case ASC_O: writeoct(mu[v_ptr++], decval(memBytes[byteIdx + ss++])); break;
                case ASC_X: writehex(mu[v_ptr++], decval(memBytes[byteIdx + ss++])); break;
                case ASC_I: writed(m[v_ptr++], decval(memBytes[byteIdx + ss++])); break;
                case ASC_N: writen(m[v_ptr++]); break;
            }
        }
    }
}

function packstring(v_ptr, s_ptr) {
    // v is short* (source, unpacked), s is byte* (dest, packed)
    // v_ptr: word index where unpacked string is (length in first word)
    // s_ptr: word index where packed string should go
    
    // In C:
    // byte l = *v, n = l / BYTESPERWORD;
    // ((short*)s)[n] = 0; // Zero terminate the last word? No, it clears the word at n?
    // do *s++ = *v++; while (l--);
    // return n;
    
    // Wait, `packstring` in C:
    // `byte l = *v` -> `l` is the length (from m[v_ptr])
    // `n = l / BYTESPERWORD` -> number of words needed (excluding length byte?)
    // `((short*)s)[n] = 0` -> clears the word at offset n from s.
    // `do *s++ = *v++; while (l--)` -> copies l+1 bytes?
    // `*v` is short. `*s` is byte.
    // It copies words from `v` to bytes at `s`.
    // This implies `v` holds characters in words (one char per word).
    
    let len = m[v_ptr];
    let n = Math.floor(len / BYTESPERWORD);
    
    // Clear the word at s_ptr + n
    m[s_ptr + n] = 0;
    
    const memBytes = new Uint8Array(buffer);
    let byteDest = s_ptr * 2;
    
    // Copy len + 1 items (length + chars)
    // The loop is `do ... while (l--)`. It runs l+1 times.
    // 1st iter: l=len. copies m[v] (which is len) to s[0]. v++, s++.
    // 2nd iter: l=len-1. copies m[v] (char 1) to s[1].
    // ...
    
    for (let i = 0; i <= len; i++) {
        memBytes[byteDest + i] = m[v_ptr + i] & 0xFF;
    }
    
    return n;
}

function unpackstring(s_ptr, v_ptr) {
    // s is byte* (source, packed), v is short* (dest, unpacked)
    const memBytes = new Uint8Array(buffer);
    let byteSrc = s_ptr * 2;
    let len = memBytes[byteSrc];
    
    // do *v++ = *s++; while (l--);
    for (let i = 0; i <= len; i++) {
        m[v_ptr + i] = memBytes[byteSrc + i];
    }
}

// Assembler variables
let cp = 0;
let ch = 0;
// labv is at the end of memory
const labv_offset = WORDCOUNT - LABVCOUNT;

function stw(w) {
    m[lomem++] = w;
    cp = 0;
}

function stc(c) {
    if (cp === 0) stw(0);
    // ((byte*)&m[lomem - 1])[cp++] = c;
    const memBytes = new Uint8Array(buffer);
    let byteAddr = (lomem - 1) * 2 + cp;
    memBytes[byteAddr] = c;
    cp++;
    if (cp === BYTESPERWORD) cp = 0;
}

function rch() {
    ch = rdch();
    while (ch === ASC_SLASH) {
        do {
            ch = rdch();
        } while (ch !== ASC_LF && ch !== ENDSTREAMCH);
        while (ch === ASC_LF) ch = rdch();
    }
}

function rdn() {
    let sum = 0;
    let neg = (ch === ASC_MINUS);
    if (neg) rch();
    while (ch >= ASC_0 && ch <= ASC_9) {
        sum = sum * 10 + (ch - ASC_0);
        rch();
    }
    return neg ? -sum : sum;
}

function labref(n, a) {
    // n is label number
    // a is address to patch
    let k = m[labv_offset + n];
    if (k < 0) {
        k = -k; // Defined label address
    } else {
        m[labv_offset + n] = a; // Add to chain
    }
    m[a] += k;
}

function halt(msg, n) {
    cos = sysprint;
    const str = msg + (n ? " #" + n : "") + "\n";
    fs.writeSync(cos - 1, str);
    process.exit(-1);
}

function assemble() {
    let n;
    
    // clear:
    for (let i = 0; i < LABVCOUNT; i++) m[labv_offset + i] = 0;
    cp = 0;
    
    // next:
    rch();
    
    while (true) { // sw:
        if (ch <= ASC_9 && ch >= ASC_0) {
            n = rdn();
            let k = m[labv_offset + n];
            if (k < 0) halt(STR_DUPLICATE_LABEL, n);
            while (k > 0) {
                let tmp = m[k];
                m[k] = lomem;
                k = tmp;
            }
            m[labv_offset + n] = -lomem;
            cp = 0;
            continue; // goto sw
        }
        
        switch (ch) {
            default:
                if (ch !== ENDSTREAMCH) halt(STR_BAD_CH, ch);
                return;
            case ASC_DOLLAR:
            case ASC_SPACE:
            case ASC_LF:
                // goto next
                rch();
                continue; // goto sw (after rch) - wait, logic is goto next which calls rch then sw.
                // My loop structure is slightly different.
                // `next:` calls `rch()` then falls into `sw:`.
                // So here I should just break switch and let loop continue?
                // No, `goto next` means go to `rch()` call.
                // `goto sw` means skip `rch()` call.
                // Let's restructure.
                break; 
                
            case ASC_L: n = F0_L; break;
            case ASC_S: n = F1_S; break;
            case ASC_A: n = F2_A; break;
            case ASC_J: n = F3_J; break;
            case ASC_T: n = F4_T; break;
            case ASC_F: n = F5_F; break;
            case ASC_K: n = F6_K; break;
            case ASC_X: n = F7_X; break;
            
            case ASC_C:
                rch();
                stc(rdn());
                continue; // goto sw
                
            case ASC_D:
                rch();
                if (ch === ASC_L) {
                    rch();
                    stw(0);
                    labref(rdn(), lomem - 1);
                } else {
                    stw(rdn());
                }
                continue; // goto sw
                
            case ASC_G:
                rch();
                n = rdn();
                if (ch === ASC_L) rch(); else halt(STR_BAD_CODE_AT_P, lomem);
                m[n] = 0;
                labref(rdn(), n);
                continue; // goto sw
                
            case ASC_Z:
                for (n = 0; n < LABVCOUNT; ++n) {
                    if (m[labv_offset + n] > 0) halt(STR_UNSET_LABEL, n);
                }
                // goto clear
                for (let i = 0; i < LABVCOUNT; i++) m[labv_offset + i] = 0;
                cp = 0;
                rch(); // next:
                continue;
        }
        
        // After switch cases that break (L, S, A, etc.)
        if (ch === ASC_DOLLAR || ch === ASC_SPACE || ch === ASC_LF) {
             rch(); continue;
        }
        
        rch();
        if (ch === ASC_I) { n |= FI_BIT; rch(); }
        if (ch === ASC_P) { n |= FP_BIT; rch(); }
        if (ch === ASC_G) { rch(); }
        
        if (ch === ASC_L) {
            rch();
            stw(n | FD_BIT);
            stw(0);
            labref(rdn(), lomem - 1);
        } else {
            let d = rdn();
            if ((d & FN_MASK) === d) {
                stw(n | (d << FN_BITS));
            } else {
                stw(n | FD_BIT);
                stw(d);
            }
        }
        // goto sw
    }
}

let trace_mode = false;

function interpret() {
    let pc = PROGSTART;
    let sp = lomem;
    let a = 0;
    let b = 0;
    let w, d;
    let v_ptr;
    
    while (true) { // fetch:
        w = mu[pc++]; // Fetch instruction (unsigned)
        
        if (w & FD_BIT) {
            d = m[pc++]; // Immediate value or address (signed)
        } else {
            d = w >>> FN_BITS; // Small constant (unsigned)
        }
        
        if (w & FP_BIT) d += sp;
        if (w & FI_BIT) d = m[d];
        
        switch (w & F7_X) {
            case F0_L: b = a; a = d; break;
            case F1_S: m[d] = a; break;
            case F2_A: a = (a + d) << 16 >> 16; break;
            case F3_J: pc = d; break;
            case F4_T: if (a !== 0) pc = d; break;
            case F5_F: if (a === 0) pc = d; break;
            case F6_K:
                d += sp;
                if (a < PROGSTART) {
                    v_ptr = d + 2;
                    switch (a) {
                        default: halt(STR_UNKNOWN_CALL, a);
                        case K01_START: break;
                        case K02_SETPM: 
                            // Call the function in 'a' (START)
                            // Set return address to the instruction after this one (FINISH)
                            // The instruction after this is at PROGSTART + 2
                            m[sp] = 0; // Previous SP
                            m[sp + 1] = PROGSTART + 2; // Return PC
                            pc = a;
                            break;
                        case K03_ABORT: break;
                        case K04_BACKTRACE: break;
                        case K11_SELECTINPUT: cis = m[v_ptr]; break;
                        case K12_SELECTOUTPUT: cos = m[v_ptr]; break;
                        case K13_RDCH: a = rdch(); break;
                        case K14_WRCH: wrch(m[v_ptr]); break;
                        case K16_INPUT: a = cis; break;
                        case K17_OUTPUT: a = cos; break;
                        case K30_STOP: return m[v_ptr];
                        case K31_LEVEL: a = sp; break;
                        case K32_LONGJUMP: sp = m[v_ptr]; pc = m[v_ptr + 1]; break;
                        case K40_APTOVEC:
                            b = d + m[v_ptr + 1] + 1;
                            m[b] = sp; m[b + 1] = pc; m[b + 2] = d; m[b + 3] = m[v_ptr + 1];
                            sp = b; pc = m[v_ptr];
                            break;
                        case K41_FINDOUTPUT: a = findoutput(m[v_ptr]); break;
                        case K42_FINDINPUT: a = findinput(m[v_ptr]); break;
                        case K46_ENDREAD: endread(); break;
                        case K47_ENDWRITE: endwrite(); break;
                        case K60_WRITES: writes(m[v_ptr]); break;
                        case K62_WRITEN: writen(m[v_ptr]); break;
                        case K63_NEWLINE: newline(); break;
                        case K64_NEWPAGE: wrch(ASC_FF); break;
                        case K66_PACKSTRING: a = packstring(m[v_ptr], m[v_ptr + 1]); break;
                        case K67_UNPACKSTRING: unpackstring(m[v_ptr], m[v_ptr + 1]); break;
                        case K68_WRITED: writed(m[v_ptr], m[v_ptr + 1]); break;
                        case K70_READN: a = readn(); break;
                        case K75_WRITEHEX: writehex(mu[v_ptr], m[v_ptr + 1]); break;
                        case K77_WRITEOCT: writeoct(mu[v_ptr], m[v_ptr + 1]); break;
                        case K76_WRITEF: writef(v_ptr); break;
                        case K85_GETBYTE: 
                            // a = ((byte*)&m[v[0]])[v[1]];
                            {
                                const memBytes = new Uint8Array(buffer);
                                let base = m[v_ptr] * 2;
                                let offset = m[v_ptr + 1];
                                a = memBytes[base + offset];
                            }
                            break;
                        case K86_PUTBYTE:
                            // ((byte*)&m[v[0]])[v[1]] = v[2];
                            {
                                const memBytes = new Uint8Array(buffer);
                                let base = m[v_ptr] * 2;
                                let offset = m[v_ptr + 1];
                                memBytes[base + offset] = m[v_ptr + 2];
                            }
                            break;
                    }
                } else {
                    m[d] = sp; m[d + 1] = pc; sp = d; pc = a;
                }
                break;
                
            case F7_X:
                switch (d) {
                    default: halt(STR_UNKNOWN_EXEC, d);
                    case 1: a = m[a]; break;
                    case 2: a = (-a) << 16 >> 16; break;
                    case 3: a = (~a) << 16 >> 16; break;
                    case 4: pc = m[sp + 1]; sp = m[sp]; break;
                    case 5: a = Math.imul(b, a) << 16 >> 16; break;
                    case 6: if (a !== 0) a = Math.trunc(b / a) << 16 >> 16; break;
                    case 7: if (a !== 0) a = (b % a) << 16 >> 16; break;
                    case 8: a = (b + a) << 16 >> 16; break;
                    case 9: a = (b - a) << 16 >> 16; break;
                    case 10: a = -(b === a); break;
                    case 11: a = -(b !== a); break;
                    case 12: a = -(b < a); break;
                    case 13: a = -(b >= a); break;
                    case 14: a = -(b > a); break;
                    case 15: a = -(b <= a); break;
                    case 16: a = (b << a) << 16 >> 16; break;
                    case 17: a = ((b & 0xFFFF) >>> a) << 16 >> 16; break;
                    case 18: a = (b & a) << 16 >> 16; break;
                    case 19: a = (b | a) << 16 >> 16; break;
                    case 20: a = (b ^ a) << 16 >> 16; break;
                    case 21: a = (b ^ ~a) << 16 >> 16; break;
                    case 22: return 0;
                    case 23:
                        // v = &m[pc]; b = *v++; pc = *v++;
                        // for (; b--; v += 2) if (a == v[0]) { pc = v[1]; goto fetch; }
                        {
                            let v_idx = pc;
                            b = m[v_idx++];
                            pc = m[v_idx++]; 
                            
                            let found = false;
                            while (b--) {
                                if (a === m[v_idx]) {
                                    pc = m[v_idx + 1];
                                    found = true;
                                    break;
                                }
                                v_idx += 2;
                            }
                        }
                        break;
                }
                break;
        }
    }
}

function loadcode(fn) {
    const f = findinput(fn);
    if (f) {
        cis = f;
        assemble();
        endread();
    }
    return f;
}

function init() {
    for (lomem = 0; lomem < PROGSTART; ++lomem) m[lomem] = lomem;
    stw(F0_L | FI_BIT | (K01_START << FN_BITS));
    stw(F6_K | (2 << FN_BITS));
    stw(F7_X | (22 << FN_BITS));
    
    // In Node, 0=stdin, 1=stdout, 2=stderr.
    // icint.c: cis = sysin = STDIN_FILENO + 1 = 1.
    // cos = sysprint = STDOUT_FILENO + 1 = 2.
    // My openfile returns fd+1.
    // So stdin (fd 0) -> 1. stdout (fd 1) -> 2.
    cis = sysin = 1;
    cos = sysprint = 2;
}

function pipeinput(fn) {
    const f = openfile(fn, 'r');
    if (!f) halt(STR_NO_INPUT, 0);
    cis = sysin = f;
}

function pipeoutput(fn) {
    const f = openfile(fn, 'w');
    if (!f) halt(STR_NO_OUTPUT, 0);
    cos = sysprint = f;
}

function main() {
    init();
    
    const args = process.argv.slice(2);
    if (args.length === 0) {
        // Interactive mode not fully supported as in C version with gets()
        // But we can try to replicate the behavior if needed.
        // The C version has #ifdef NO_ARGS for interactive.
        // The #else part handles args.
        // Let's assume args are provided or show usage.
        // halt(STR_USAGE, 0);
        
        // Replicate NO_ARGS behavior?
        // It asks for ICFILE, INPUT, OUTPUT.
        // This requires synchronous readline which is tricky in Node.
        // Let's stick to args for now.
        console.log(STR_USAGE);
        process.exit(0);
    }
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('-')) {
            if (arg.startsWith('-i')) {
                pipeinput(arg.substring(2));
            } else if (arg.startsWith('-o')) {
                pipeoutput(arg.substring(2));
            } else if (arg === '-trace') {
                trace_mode = true;
            } else {
                halt(STR_INVALID_OPTION, i);
            }
        } else {
            if (!loadcode(arg)) halt(STR_NO_ICFILE, 0);
        }
    }
    
    interpret();
}

main();
