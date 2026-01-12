#!/usr/bin/env python3
"""
BCPL INTCODE Interpreter - Python Port

This is a pure Python port of the BCPL INTCODE interpreter (icint.c / icint.js).
It allows compiling and running BCPL programs in a Python environment.

Ported from the Node.js version at https://github.com/dagfinndybvig/nodeBCPL
"""

import sys
import os

# ============================================================================
# Constants
# ============================================================================

# ASCII character codes
ASC_TAB = 8
ASC_LF = 10
ASC_FF = 12
ASC_CR = 13
ASC_SPACE = 32
ASC_DOLLAR = 36
ASC_PERCENT = 37
ASC_PLUS = 43
ASC_MINUS = 45
ASC_SLASH = 47

ASC_0 = 48
ASC_9 = 57
ASC_A = 65
ASC_Z = 90

ASC_L = 76
ASC_S = 83
ASC_J = 74
ASC_T = 84
ASC_F = 70
ASC_K = 75
ASC_X = 88
ASC_C = 67
ASC_D = 68
ASC_G = 71
ASC_I = 73
ASC_P = 80
ASC_O = 79
ASC_N = 78

# Error messages
STR_NO_INPUT = "NO INPUT"
STR_NO_OUTPUT = "NO OUTPUT"
STR_NO_ICFILE = "NO ICFILE"
STR_INVALID_OPTION = "INVALID OPTION"
STR_DUPLICATE_LABEL = "DUPLICATE LABEL"
STR_BAD_CODE_AT_P = "BAD CODE AT P"
STR_UNSET_LABEL = "UNSET LABEL"
STR_BAD_CH = "BAD CH"
STR_UNKNOWN_CALL = "UNKNOWN CALL"
STR_UNKNOWN_EXEC = "UNKNOWN EXEC"
STR_INTCODE_ERROR_AT_PC = "INTCODE ERROR AT PC"
STR_USAGE = "USAGE: python icint.py ICFILE [...] [-iINPUT] [-oOUTPUT]"

# Memory configuration
PROGSTART = 401
WORDCOUNT = 19900
LABVCOUNT = 500

# Instruction encoding
FN_BITS = 8
FN_MASK = 255
F0_L = 0
F1_S = 1
F2_A = 2
F3_J = 3
F4_T = 4
F5_F = 5
F6_K = 6
F7_X = 7
FI_BIT = 1 << 3
FP_BIT = 1 << 4
FD_BIT = 1 << 5

# K-codes (system calls)
K01_START = 1
K02_SETPM = 2
K03_ABORT = 3
K04_BACKTRACE = 4
K11_SELECTINPUT = 11
K12_SELECTOUTPUT = 12
K13_RDCH = 13
K14_WRCH = 14
K15_UNRDCH = 15
K16_INPUT = 16
K17_OUTPUT = 17
K30_STOP = 30
K31_LEVEL = 31
K32_LONGJUMP = 32
K34_BINWRCH = 34
K35_REWIND = 35
K40_APTOVEC = 40
K41_FINDOUTPUT = 41
K42_FINDINPUT = 42
K46_ENDREAD = 46
K47_ENDWRITE = 47
K60_WRITES = 60
K62_WRITEN = 62
K63_NEWLINE = 63
K64_NEWPAGE = 64
K65_WRITEO = 65
K66_PACKSTRING = 66
K67_UNPACKSTRING = 67
K68_WRITED = 68
K69_WRITEARG = 69
K70_READN = 70
K71_TERMINATOR = 71
K74_WRITEX = 74
K75_WRITEHEX = 75
K76_WRITEF = 76
K77_WRITEOCT = 77
K78_MAPSTORE = 78
K85_GETBYTE = 85
K86_PUTBYTE = 86
K87_GETVEC = 87
K88_FREEVEC = 88
K89_RANDOM = 89
K90_MULDIV = 90
K91_RESULT2 = 91

ENDSTREAMCH = -1
BYTESPERWORD = 2

# ============================================================================
# Memory - Using a list for fast access (Python lists are faster than array.array)
# ============================================================================

# Use a plain Python list - values stored as Python integers,
# converted to 16-bit signed values when needed for INTCODE semantics
m = [0] * WORDCOUNT

def _get_byte(byte_idx):
    """Get a byte from memory (little-endian)."""
    word_idx = byte_idx >> 1
    val = m[word_idx] & 0xFFFF
    if byte_idx & 1:
        return (val >> 8) & 0xFF
    return val & 0xFF

def _set_byte(byte_idx, val):
    """Set a byte in memory (little-endian)."""
    word_idx = byte_idx >> 1
    current = m[word_idx] & 0xFFFF
    val = val & 0xFF
    if byte_idx & 1:
        new_val = (current & 0x00FF) | (val << 8)
    else:
        new_val = (current & 0xFF00) | val
    # Convert to signed 16-bit if > 32767
    if new_val >= 0x8000:
        new_val -= 0x10000
    m[word_idx] = new_val

def mu_get(idx):
    """Get unsigned 16-bit value at index."""
    return m[idx] & 0xFFFF

def m_set(idx, val):
    """Set a 16-bit value in memory, handling sign."""
    val = val & 0xFFFF
    if val >= 0x8000:
        val -= 0x10000
    m[idx] = val

# Global state
lomem = 0
himem = WORDCOUNT - 1
cis = 0
cos = 0
sysin = 0
sysprint = 0

# Assembler state
cp = 0
ch = 0
labv_offset = WORDCOUNT - LABVCOUNT

# File handles - dictionary to track open files
_file_handles = {}
_next_handle = 10  # Start from 10 to avoid conflicts with stdin/stdout

# ============================================================================
# String Handling
# ============================================================================

def cstr(s_ptr):
    """Convert BCPL string (packed) to Python string.
    
    BCPL strings are packed: length byte, then chars.
    s_ptr is a word index in memory.
    """
    byte_idx = s_ptr * 2
    length = _get_byte(byte_idx)
    chars = []
    for i in range(length):
        chars.append(chr(_get_byte(byte_idx + 1 + i)))
    return ''.join(chars)

def decval(c):
    """Convert character to decimal value."""
    if ASC_0 <= c <= ASC_9:
        return c - ASC_0
    if ASC_A <= c <= ASC_Z:
        return c - ASC_A + 10
    return 0

STRDIGITS = "0123456789ABCDEF"

# ============================================================================
# File I/O
# ============================================================================

def openfile(fn, mode):
    """Open a file and return a handle."""
    global _next_handle, _file_handles
    
    fn_upper = fn.upper()
    if fn_upper == "SYSIN":
        return sysin
    if fn_upper == "SYSPRINT":
        return sysprint
    
    try:
        if mode == 'r':
            # Try original filename first, then lowercase
            try:
                f = open(fn, 'rb')
            except FileNotFoundError:
                if fn != fn.lower():
                    f = open(fn.lower(), 'rb')
                else:
                    return 0
        else:  # mode == 'w'
            f = open(fn, 'wb')
        
        handle = _next_handle
        _next_handle += 1
        _file_handles[handle] = f
        return handle
    except (FileNotFoundError, IOError):
        return 0

def findinput(fn_bcpl):
    """Open a file for input."""
    if isinstance(fn_bcpl, int):
        fn = cstr(fn_bcpl)
    else:
        fn = fn_bcpl
    return openfile(fn, 'r')

def findoutput(fn_bcpl):
    """Open a file for output."""
    if isinstance(fn_bcpl, int):
        fn = cstr(fn_bcpl)
    else:
        fn = fn_bcpl
    return openfile(fn, 'w')

def endread():
    """Close the current input stream."""
    global cis
    if cis != sysin and cis in _file_handles:
        _file_handles[cis].close()
        del _file_handles[cis]
    cis = sysin

def endwrite():
    """Close the current output stream."""
    global cos
    if cos != sysprint and cos in _file_handles:
        _file_handles[cos].close()
        del _file_handles[cos]
    cos = sysprint

def rdch():
    """Read a character from the current input stream."""
    if cis == sysin:
        # Read from stdin
        c = sys.stdin.buffer.read(1)
        if not c:
            return ENDSTREAMCH
        c = c[0]
    elif cis in _file_handles:
        c = _file_handles[cis].read(1)
        if not c:
            return ENDSTREAMCH
        c = c[0]
    else:
        return ENDSTREAMCH
    
    return ASC_LF if c == ASC_CR else c

def wrch(c):
    """Write a character to the current output stream."""
    if c == ASC_LF:
        newline()
    else:
        if cos == sysprint:
            sys.stdout.buffer.write(bytes([c]))
            sys.stdout.buffer.flush()
        elif cos in _file_handles:
            _file_handles[cos].write(bytes([c]))

def newline():
    """Write a newline to the current output stream."""
    if cos == sysprint:
        sys.stdout.write("\n")
        sys.stdout.flush()
    elif cos in _file_handles:
        _file_handles[cos].write(b"\n")

def writes(s_ptr):
    """Write a BCPL string to the current output stream."""
    byte_idx = s_ptr * 2
    length = _get_byte(byte_idx)
    for i in range(length):
        wrch(_get_byte(byte_idx + 1 + i))

def writed(n, d):
    """Write a decimal number with field width d."""
    s = str(abs(n))
    if n < 0:
        s = "-" + s
    while len(s) < d:
        s = " " + s
    for c in s:
        wrch(ord(c))

def writen(n):
    """Write a decimal number."""
    writed(n, 0)

def readn():
    """Read a number from the current input stream."""
    global m
    c = rdch()
    
    # Skip whitespace
    while c == ASC_SPACE or c == ASC_LF or c == ASC_TAB:
        c = rdch()
    
    neg = (c == ASC_MINUS)
    if neg or c == ASC_PLUS:
        c = rdch()
    
    total = 0
    while ASC_0 <= c <= ASC_9:
        total = total * 10 + (c - ASC_0)
        c = rdch()
    
    m[K71_TERMINATOR] = c
    return -total if neg else total

def writeoct(n, d):
    """Write a number in octal with field width d."""
    n = n & 0xFFFF  # Ensure unsigned
    if d > 1:
        writeoct(n >> 3, d - 1)
    wrch(ord(STRDIGITS[n & 7]))

def writehex(n, d):
    """Write a number in hexadecimal with field width d."""
    n = n & 0xFFFF  # Ensure unsigned
    if d > 1:
        writehex(n >> 4, d - 1)
    wrch(ord(STRDIGITS[n & 15]))

def writef(v_ptr):
    """Formatted write using BCPL format string."""
    fmt_ptr = m[v_ptr]
    v_ptr += 1
    
    byte_idx = fmt_ptr * 2
    length = _get_byte(byte_idx)
    ss = 1
    
    while ss <= length:
        c = _get_byte(byte_idx + ss)
        ss += 1
        
        if c != ASC_PERCENT:
            wrch(c)
        else:
            c = _get_byte(byte_idx + ss)
            ss += 1
            
            if c == ASC_S:
                writes(m[v_ptr])
                v_ptr += 1
            elif c == ASC_C:
                wrch(m[v_ptr])
                v_ptr += 1
            elif c == ASC_O:
                n = mu_get(v_ptr)
                v_ptr += 1
                d = decval(_get_byte(byte_idx + ss))
                ss += 1
                writeoct(n, d)
            elif c == ASC_X:
                n = mu_get(v_ptr)
                v_ptr += 1
                d = decval(_get_byte(byte_idx + ss))
                ss += 1
                writehex(n, d)
            elif c == ASC_I:
                n = m[v_ptr]
                v_ptr += 1
                d = decval(_get_byte(byte_idx + ss))
                ss += 1
                writed(n, d)
            elif c == ASC_N:
                writen(m[v_ptr])
                v_ptr += 1
            else:
                wrch(c)

def packstring(v_ptr, s_ptr):
    """Pack a BCPL string from words to bytes."""
    length = m[v_ptr]
    n = length // BYTESPERWORD
    
    # Clear the word at s_ptr + n
    m[s_ptr + n] = 0
    
    byte_dest = s_ptr * 2
    
    # Copy length + 1 items (length byte + chars)
    for i in range(length + 1):
        _set_byte(byte_dest + i, m[v_ptr + i] & 0xFF)
    
    return n

def unpackstring(s_ptr, v_ptr):
    """Unpack a BCPL string from bytes to words."""
    byte_src = s_ptr * 2
    length = _get_byte(byte_src)
    
    for i in range(length + 1):
        m[v_ptr + i] = _get_byte(byte_src + i)

# ============================================================================
# Assembler
# ============================================================================

def stw(w):
    """Store a word in memory."""
    global lomem, cp
    # Convert to signed 16-bit
    w = w & 0xFFFF
    if w >= 0x8000:
        w -= 0x10000
    m[lomem] = w
    lomem += 1
    cp = 0

def stc(c):
    """Store a character (byte) in memory."""
    global lomem, cp
    if cp == 0:
        stw(0)
    
    byte_addr = (lomem - 1) * 2 + cp
    _set_byte(byte_addr, c)
    cp += 1
    if cp == BYTESPERWORD:
        cp = 0

def rch():
    """Read a character for the assembler, skipping comments."""
    global ch
    ch = rdch()
    while ch == ASC_SLASH:
        while ch != ASC_LF and ch != ENDSTREAMCH:
            ch = rdch()
        while ch == ASC_LF:
            ch = rdch()

def rdn():
    """Read a number for the assembler."""
    global ch
    total = 0
    neg = (ch == ASC_MINUS)
    if neg:
        rch()
    while ASC_0 <= ch <= ASC_9:
        total = total * 10 + (ch - ASC_0)
        rch()
    return -total if neg else total

def labref(n, a):
    """Handle a label reference."""
    k = m[labv_offset + n]
    if k < 0:
        k = -k  # Defined label address
    else:
        m[labv_offset + n] = a  # Add to chain
    new_val = (m[a] + k) & 0xFFFF
    if new_val >= 0x8000:
        new_val -= 0x10000
    m[a] = new_val

def halt(msg, n=None):
    """Print an error message and exit."""
    global cos
    cos = sysprint
    if n is not None:
        sys.stderr.write(f"{msg} #{n}\n")
    else:
        sys.stderr.write(f"{msg}\n")
    sys.exit(1)

def assemble():
    """Assemble INTCODE from the current input stream."""
    global cp, ch, lomem
    
    # Clear labels
    for i in range(LABVCOUNT):
        m[labv_offset + i] = 0
    cp = 0
    
    rch()  # Read first character
    
    while True:
        # Check for label definition (starts with digit)
        if ASC_0 <= ch <= ASC_9:
            n = rdn()
            k = m[labv_offset + n]
            if k < 0:
                halt(STR_DUPLICATE_LABEL, n)
            while k > 0:
                tmp = m[k]
                m[k] = lomem
                k = tmp
            m[labv_offset + n] = -lomem
            cp = 0
            continue
        
        # Handle different instruction characters
        if ch == ENDSTREAMCH:
            return
        
        if ch in (ASC_DOLLAR, ASC_SPACE, ASC_LF):
            rch()
            continue
        
        n = None
        if ch == ASC_L:
            n = F0_L
        elif ch == ASC_S:
            n = F1_S
        elif ch == ord('A'):  # ASC_A
            n = F2_A
        elif ch == ASC_J:
            n = F3_J
        elif ch == ASC_T:
            n = F4_T
        elif ch == ASC_F:
            n = F5_F
        elif ch == ASC_K:
            n = F6_K
        elif ch == ASC_X:
            n = F7_X
        elif ch == ASC_C:
            rch()
            stc(rdn())
            continue
        elif ch == ASC_D:
            rch()
            if ch == ASC_L:
                rch()
                stw(0)
                labref(rdn(), lomem - 1)
            else:
                stw(rdn())
            continue
        elif ch == ASC_G:
            rch()
            n = rdn()
            if ch == ASC_L:
                rch()
            else:
                halt(STR_BAD_CODE_AT_P, lomem)
            m[n] = 0
            labref(rdn(), n)
            continue
        elif ch == ASC_Z:
            # Check for unset labels
            for i in range(LABVCOUNT):
                if m[labv_offset + i] > 0:
                    halt(STR_UNSET_LABEL, i)
            # Clear labels
            for i in range(LABVCOUNT):
                m[labv_offset + i] = 0
            cp = 0
            rch()
            continue
        else:
            halt(STR_BAD_CH, ch)
        
        # Process L, S, A, J, T, F, K, X instructions
        rch()
        if ch == ASC_I:
            n |= FI_BIT
            rch()
        if ch == ASC_P:
            n |= FP_BIT
            rch()
        if ch == ASC_G:
            rch()
        
        if ch == ASC_L:
            rch()
            stw(n | FD_BIT)
            stw(0)
            labref(rdn(), lomem - 1)
        else:
            d = rdn()
            if (d & FN_MASK) == d:
                stw(n | (d << FN_BITS))
            else:
                stw(n | FD_BIT)
                stw(d)

# ============================================================================
# Interpreter
# ============================================================================

def interpret():
    """Execute INTCODE starting from PROGSTART.
    
    Optimized version with local variable caching for better performance.
    """
    global cis, cos
    
    # Cache globals locally for faster access
    _m = m
    
    # Cache constants locally
    _PROGSTART = PROGSTART
    _FD_BIT = FD_BIT
    _FP_BIT = FP_BIT
    _FI_BIT = FI_BIT
    _FN_BITS = FN_BITS
    
    pc = _PROGSTART
    sp = lomem
    a = 0
    b = 0
    
    # Helper function to convert to signed 16-bit (inline for performance)
    def _s16(val):
        val = val & 0xFFFF
        return val - 0x10000 if val >= 0x8000 else val
    
    while True:
        # Fetch instruction (unsigned)
        w = _m[pc] & 0xFFFF
        pc += 1
        
        # Decode operand
        if w & _FD_BIT:
            d = _m[pc]
            pc += 1
        else:
            d = w >> _FN_BITS
        
        if w & _FP_BIT:
            d = _s16(d + sp)
        if w & _FI_BIT:
            d = _m[d]
        
        fn = w & 7  # F7_X = 7
        
        if fn == 0:  # L - Load
            b = a
            a = d
        elif fn == 1:  # S - Store
            _m[d] = a
        elif fn == 2:  # A - Add
            a = _s16(a + d)
        elif fn == 3:  # J - Jump
            pc = d
        elif fn == 4:  # T - True jump
            if a != 0:
                pc = d
        elif fn == 5:  # F - False jump
            if a == 0:
                pc = d
        elif fn == 6:  # K - Call
            d = _s16(d + sp)
            
            if a < _PROGSTART:
                v_ptr = d + 2
                
                # System calls (K-codes)
                if a == 1:  # K01_START
                    pass
                elif a == 2:  # K02_SETPM
                    _m[sp] = 0
                    _m[sp + 1] = _PROGSTART + 2
                    pc = a
                elif a == 3 or a == 4:  # K03_ABORT, K04_BACKTRACE
                    pass
                elif a == 11:  # K11_SELECTINPUT
                    cis = _m[v_ptr]
                elif a == 12:  # K12_SELECTOUTPUT
                    cos = _m[v_ptr]
                elif a == 13:  # K13_RDCH
                    a = rdch()
                elif a == 14:  # K14_WRCH
                    wrch(_m[v_ptr])
                elif a == 16:  # K16_INPUT
                    a = cis
                elif a == 17:  # K17_OUTPUT
                    a = cos
                elif a == 30:  # K30_STOP
                    return _m[v_ptr]
                elif a == 31:  # K31_LEVEL
                    a = sp
                elif a == 32:  # K32_LONGJUMP
                    sp = _m[v_ptr]
                    pc = _m[v_ptr + 1]
                elif a == 40:  # K40_APTOVEC
                    b = d + _m[v_ptr + 1] + 1
                    _m[b] = sp
                    _m[b + 1] = pc
                    _m[b + 2] = d
                    _m[b + 3] = _m[v_ptr + 1]
                    sp = b
                    pc = _m[v_ptr]
                elif a == 41:  # K41_FINDOUTPUT
                    a = findoutput(_m[v_ptr])
                elif a == 42:  # K42_FINDINPUT
                    a = findinput(_m[v_ptr])
                elif a == 46:  # K46_ENDREAD
                    endread()
                elif a == 47:  # K47_ENDWRITE
                    endwrite()
                elif a == 60:  # K60_WRITES
                    writes(_m[v_ptr])
                elif a == 62:  # K62_WRITEN
                    writen(_m[v_ptr])
                elif a == 63:  # K63_NEWLINE
                    newline()
                elif a == 64:  # K64_NEWPAGE
                    wrch(12)  # ASC_FF
                elif a == 66:  # K66_PACKSTRING
                    a = packstring(_m[v_ptr], _m[v_ptr + 1])
                elif a == 67:  # K67_UNPACKSTRING
                    unpackstring(_m[v_ptr], _m[v_ptr + 1])
                elif a == 68:  # K68_WRITED
                    writed(_m[v_ptr], _m[v_ptr + 1])
                elif a == 70:  # K70_READN
                    a = readn()
                elif a == 75:  # K75_WRITEHEX
                    writehex(_m[v_ptr] & 0xFFFF, _m[v_ptr + 1])
                elif a == 77:  # K77_WRITEOCT
                    writeoct(_m[v_ptr] & 0xFFFF, _m[v_ptr + 1])
                elif a == 76:  # K76_WRITEF
                    writef(v_ptr)
                elif a == 85:  # K85_GETBYTE
                    base = _m[v_ptr] * 2
                    offset = _m[v_ptr + 1]
                    a = _get_byte(base + offset)
                elif a == 86:  # K86_PUTBYTE
                    base = _m[v_ptr] * 2
                    offset = _m[v_ptr + 1]
                    _set_byte(base + offset, _m[v_ptr + 2])
                else:
                    halt(STR_UNKNOWN_CALL, a)
            else:
                _m[d] = sp
                _m[d + 1] = pc
                sp = d
                pc = a
        
        elif fn == 7:  # X - Execute
            if d == 1:
                a = _m[a]
            elif d == 2:
                a = _s16(-a)
            elif d == 3:
                a = _s16(~a)
            elif d == 4:
                pc = _m[sp + 1]
                sp = _m[sp]
            elif d == 5:
                a = _s16(b * a)
            elif d == 6:
                if a != 0:
                    # Integer division like C
                    sign = -1 if (b < 0) != (a < 0) else 1
                    a = sign * (abs(b) // abs(a))
            elif d == 7:
                if a != 0:
                    # Modulo like C (sign follows dividend)
                    if b < 0:
                        a = -(abs(b) % abs(a))
                    else:
                        a = abs(b) % abs(a)
            elif d == 8:
                a = _s16(b + a)
            elif d == 9:
                a = _s16(b - a)
            elif d == 10:
                a = -1 if (b == a) else 0
            elif d == 11:
                a = -1 if (b != a) else 0
            elif d == 12:
                a = -1 if (b < a) else 0
            elif d == 13:
                a = -1 if (b >= a) else 0
            elif d == 14:
                a = -1 if (b > a) else 0
            elif d == 15:
                a = -1 if (b <= a) else 0  # LE
            elif d == 16:
                a = _s16(b << a)   # LSH
            elif d == 17:
                # Logical right shift (unsigned)
                a = _s16((b & 0xFFFF) >> a)  # RSH
            elif d == 18:
                a = _s16(b & a)    # AND
            elif d == 19:
                a = _s16(b | a)    # OR
            elif d == 20:
                a = _s16(b ^ a)    # XOR
            elif d == 21:
                a = _s16(b ^ ~a)   # EQV
            elif d == 22:
                return 0  # FINISH
            elif d == 23:
                # SWITCHON
                v_idx = pc
                cnt = _m[v_idx]
                v_idx += 1
                pc = _m[v_idx]
                v_idx += 1
                
                while cnt > 0:
                    if a == _m[v_idx]:
                        pc = _m[v_idx + 1]
                        break
                    v_idx += 2
                    cnt -= 1
            else:
                halt(STR_UNKNOWN_EXEC, d)

def loadcode(fn):
    """Load and assemble INTCODE from a file."""
    global cis
    f = findinput(fn)
    if f:
        cis = f
        assemble()
        endread()
    return f

def init():
    """Initialize the interpreter."""
    global lomem, cis, cos, sysin, sysprint
    
    # Initialize global vector
    for i in range(PROGSTART):
        m[i] = i
    lomem = PROGSTART
    
    # Store initial code
    stw(F0_L | FI_BIT | (K01_START << FN_BITS))
    stw(F6_K | (2 << FN_BITS))
    stw(F7_X | (22 << FN_BITS))
    
    # Set up stdin/stdout
    # stdin = 1, stdout = 2 (1-based, like the C/JS version)
    cis = sysin = 1
    cos = sysprint = 2
    
    # Register stdin and stdout in file handles
    _file_handles[1] = sys.stdin
    _file_handles[2] = sys.stdout

def pipeinput(fn):
    """Set up piped input from a file."""
    global cis, sysin
    f = openfile(fn, 'r')
    if not f:
        halt(STR_NO_INPUT)
    cis = sysin = f

def pipeoutput(fn):
    """Set up piped output to a file."""
    global cos, sysprint
    f = openfile(fn, 'w')
    if not f:
        halt(STR_NO_OUTPUT)
    cos = sysprint = f

def main():
    """Main entry point."""
    init()
    
    args = sys.argv[1:]
    if not args:
        print(STR_USAGE)
        sys.exit(0)
    
    for arg in args:
        if arg.startswith('-'):
            if arg.startswith('-i'):
                pipeinput(arg[2:])
            elif arg.startswith('-o'):
                pipeoutput(arg[2:])
            else:
                halt(STR_INVALID_OPTION)
        else:
            if not loadcode(arg):
                halt(STR_NO_ICFILE)
    
    result = interpret()
    sys.exit(result)

if __name__ == "__main__":
    main()
