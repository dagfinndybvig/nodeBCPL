
#include "icint.h"

#define byte unsigned char
#define word unsigned short
#define bool unsigned char

#ifdef __ANSI_FUNCTION__
#define fn0(RET,NAME) RET NAME(void)
#define fn1(RET,NAME,T1,V1) RET NAME(T1 V1)
#define fn2(RET,NAME,T1,V1,T2,V2) RET NAME(T1 V1, T2 V2)
#define fn3(RET,NAME,T1,V1,T2,V2,T3,V3) RET NAME(T1 V1, T2 V2, T3 V3)
#else
#define fn0(RET,NAME) RET NAME()
#define fn1(RET,NAME,T1,V1) RET NAME(V1) T1 V1;
#define fn2(RET,NAME,T1,V1,T2,V2) RET NAME(V1, V2) T1 V1; T2 V2;
#define fn3(RET,NAME,T1,V1,T2,V2,T3,V3) RET NAME(V1, V2, V3) T1 V1; T2 V2; T3 V3;
#endif

#define ASC_TAB     (8)
#define ASC_LF      (10)
#define ASC_FF      (12)
#define ASC_CR      (13)
#define ASC_SPACE   (32)
#define ASC_DOLLAR  (36)
#define ASC_PERCENT (37)
#define ASC_PLUS    (43)
#define ASC_MINUS   (45)
#define ASC_SLASH   (47)

#define ASC_0 (48)
#define ASC_1 (49)
#define ASC_2 (50)
#define ASC_3 (51)
#define ASC_4 (52)
#define ASC_5 (53)
#define ASC_6 (54)
#define ASC_7 (55)
#define ASC_8 (56)
#define ASC_9 (57)
#define ASC_A (65)
#define ASC_C (67)
#define ASC_D (68)
#define ASC_F (70)
#define ASC_G (71)
#define ASC_I (73)
#define ASC_J (74)
#define ASC_K (75)
#define ASC_L (76)
#define ASC_N (78)
#define ASC_O (79)
#define ASC_P (80)
#define ASC_S (83)
#define ASC_T (84)
#define ASC_X (88)
#define ASC_Z (90)

#define STR_NO_INPUT "NO INPUT"
#define STR_NO_OUTPUT "NO OUTPUT"
#define STR_NO_ICFILE "NO ICFILE"
#define STR_INVALID_OPTION "INVALID OPTION"
#define STR_DUPLICATE_LABEL "DUPLICATE LABEL"
#define STR_BAD_CODE_AT_P "BAD CODE AT P"
#define STR_UNSET_LABEL "UNSET LABEL"
#define STR_BAD_CH "BAD CH"
#define STR_UNKNOWN_CALL "UNKNOWN CALL"
#define STR_UNKNOWN_EXEC "UNKNOWN EXEC"
#define STR_INTCODE_ERROR_AT_PC "INTCODE ERROR AT PC"
#define STR_USAGE "USAGE: icint ICFILE [...] [-iINPUT] [-oOUTPUT]"

#define PROGSTART (401)
#define WORDCOUNT (19900)
#define LABVCOUNT (500)

#define FN_BITS   (8)
#define FN_MASK   (255)
#define F0_L      (0)
#define F1_S      (1)
#define F2_A      (2)
#define F3_J      (3)
#define F4_T      (4)
#define F5_F      (5)
#define F6_K      (6)
#define F7_X      (7)
#define FI_BIT    (1 << 3)
#define FP_BIT    (1 << 4)
#define FD_BIT    (1 << 5)

/* bcpltape/sys3/bcpl/libhdr */

#define K01_START          1
#define K02_SETPM          2
#define K03_ABORT          3
#define K04_BACKTRACE      4
#define K11_SELECTINPUT   11
#define K12_SELECTOUTPUT  12
#define K13_RDCH          13
#define K14_WRCH          14
#define K15_UNRDCH        15
#define K16_INPUT         16
#define K17_OUTPUT        17
#define K30_STOP          30
#define K31_LEVEL         31
#define K32_LONGJUMP      32
#define K34_BINWRCH       34
#define K35_REWIND        35
#define K40_APTOVEC       40
#define K41_FINDOUTPUT    41
#define K42_FINDINPUT     42
#define K46_ENDREAD       46
#define K47_ENDWRITE      47
#define K60_WRITES        60
#define K62_WRITEN        62
#define K63_NEWLINE       63
#define K64_NEWPAGE       64
#define K65_WRITEO        65
#define K66_PACKSTRING    66
#define K67_UNPACKSTRING  67
#define K68_WRITED        68
#define K69_WRITEARG      69
#define K70_READN         70
#define K71_TERMINATOR    71
#define K74_WRITEX        74
#define K75_WRITEHEX      75
#define K76_WRITEF        76
#define K77_WRITEOCT      77
#define K78_MAPSTORE      78
#define K85_GETBYTE       85
#define K86_PUTBYTE       86
#define K87_GETVEC        87
#define K88_FREEVEC       88
#define K89_RANDOM        89
#define K90_MULDIV        90
#define K91_RESULT2       91

#define ENDSTREAMCH   (-1)
#define BYTESPERWORD  sizeof(word)


fn2(char*, cstr, char*, d, byte*, s) {
  memcpy(d, s + 1, *s);
  d[*s] = 0;
  return d;
}

fn2(byte*, bstr, byte*, d, char*, s) {
  memcpy(d + 1, s, *d = strlen(s));
  return d;
}

fn2(void, unpackstring, byte*, s, short*, v) {
  byte l = *s;
  do *v++ = *s++; while (l--);
}

fn2(short, packstring, short*, v, byte*, s) {
  byte l = *v, n = l / BYTESPERWORD;
  ((short*)s)[n] = 0;
  do *s++ = *v++; while (l--);
  return n;
}

fn1(short, decval, short, c) {
  return
    c >= ASC_0 && c <= ASC_9 ? c - ASC_0 :
    c >= ASC_A && c <= ASC_Z ? c - ASC_A + 10 :
    0;
}

char strdigits[] = "0123456789ABCDEF";
short m[WORDCOUNT], lomem, himem = WORDCOUNT - 1, cis, cos, sysin, sysprint;

fn2(short, openfile, char*, fn, short, fm) {
  return
    !stricmp(fn, "SYSIN") ? sysin :
    !stricmp(fn, "SYSPRINT") ? sysprint :
    open(fn, fm, S_IRWXU) + 1;
}

fn1(short, findinput, byte*, fn) {
  char s[FILENAME_MAX];
  return openfile(cstr(s, fn), O_RDONLY | O_BINARY);
}

fn1(short, findoutput, byte*, fn) {
  char s[FILENAME_MAX];
  return openfile(cstr(s, fn), O_CREAT | O_WRONLY | O_TRUNC | O_BINARY);
}

fn0(void, endread) {
  close(cis - 1);
  cis = sysin;
}

fn0(void, endwrite) {
  close(cos - 1);
  cos = sysprint;
}

fn0(short, rdch) {
  byte c;
  return read(cis - 1, &c, 1) != 1 ? ENDSTREAMCH : c == ASC_CR ? ASC_LF : c;
}

fn0(void, newline) {
  write(cos - 1, "\n", 1);
}

fn1(void, wrch, byte, c) {
  if (c == ASC_LF) newline(); else write(cos - 1, &c, 1);
}

fn1(void, writes, byte*, s) {
  byte l = *s;
  while (l--) wrch(*++s);
}

fn2(void, writed, short, n, short, d) {
  char s[32], *p = s;
  bool neg = n < 0;
  if (neg) n = -n;
  do { *p++ = n % 10 + ASC_0; n /= 10; } while (n);
  if (neg) *p++ = ASC_MINUS;
  for (d -= p - s; d > 0; --d) wrch(ASC_SPACE);
  while (p-- > s) wrch(*p);
}

fn1(void, writen, short, n) {
  writed(n, 0);
}

fn0(short, readn) {
  short sum = 0, c;
  bool neg;
  do c = rdch(); while (c == ASC_SPACE || c == ASC_LF || c == ASC_TAB);
  neg = c == ASC_MINUS;
  if (neg || (c == ASC_PLUS)) c = rdch();
  while (c >= ASC_0 && c <= ASC_9) {
    sum = sum * 10 + c - ASC_0;
    c = rdch();
  }
  m[K71_TERMINATOR] = c;
  return neg ? -sum : sum;
}

fn2(void, writeoct, word, n, short, d) {
  if (d > 1) writeoct(n >> 3, d - 1);
  wrch(strdigits[n & 7]);
}

fn2(void, writehex, word, n, short, d) {
  if (d > 1) writehex(n >> 4, d - 1);
  wrch(strdigits[n & 15]);
}

fn1(void, writef, short*, v) {
  byte *s = (byte*)&m[*v++], ss = 1;
  while (ss <= *s) {
    byte c = s[ss++];
    if (c != ASC_PERCENT) wrch(c); else {
      switch (c = s[ss++]) {
        default : wrch(c); break;
        case ASC_S: writes((byte*)&m[*v++]); break;
        case ASC_C: wrch(*v++); break;
        case ASC_O: writeoct(*v++, decval(s[ss++])); break;
        case ASC_X: writehex(*v++, decval(s[ss++])); break;
        case ASC_I: writed(*v++, decval(s[ss++])); break;
        case ASC_N: writen(*v++); break;
      }
    }
  }
}

byte cp;
short ch, *labv = &m[WORDCOUNT - LABVCOUNT];

fn1(void, stw, short, w) {
  m[lomem++] = w; cp = 0;
}

fn1(void, stc, byte, c) {
  if (!cp) stw(0);
  ((byte*)&m[lomem - 1])[cp++] = c;
  if (cp == BYTESPERWORD) cp = 0;
}

fn0(void, rch) {
  for (ch = rdch(); ch == ASC_SLASH; ) {
    do ch = rdch(); while (ch != ASC_LF && ch != ENDSTREAMCH);
    while (ch == ASC_LF) ch = rdch();
  }
}

fn0(short, rdn) {
  short sum = 0;
  bool neg = ch == ASC_MINUS;
  if (neg) rch();
  while (ch >= ASC_0 && ch <= ASC_9) { sum = sum * 10 + ch - ASC_0; rch(); }
  return neg ? -sum : sum;
}

fn2(void, labref, short, n, short, a) {
  short k = labv[n];
  if (k < 0) k = -k; else labv[n] = a;
  m[a] += k;
}

fn1(void, writecstr, char*, s) {
  write(cos - 1, s, strlen(s));
}

fn2(void, halt, char*, msg, short, n) {
  cos = sysprint;
  writecstr(msg);
  if (n) { writecstr(" #"); writen(n); }
  newline();
  exit(-1);
}

fn0(void, assemble) {
  register short n;
clear:
  memclr(labv, LABVCOUNT * BYTESPERWORD); cp = 0;
next:
  rch();
sw:
  if (ch <= ASC_9 && ch >= ASC_0) {
    short k = labv[n = rdn()];
    if (k < 0) halt(STR_DUPLICATE_LABEL, n);
    while (k > 0) { short tmp = m[k]; m[k] = lomem; k = tmp; }
    labv[n] = -lomem; cp = 0; goto sw;
  }
  switch (ch) {
    default: if (ch != ENDSTREAMCH) halt(STR_BAD_CH, ch); return;
    case ASC_DOLLAR: case ASC_SPACE: case ASC_LF: goto next;
    case ASC_L: n = F0_L; break; case ASC_S: n = F1_S; break;
    case ASC_A: n = F2_A; break; case ASC_J: n = F3_J; break;
    case ASC_T: n = F4_T; break; case ASC_F: n = F5_F; break;
    case ASC_K: n = F6_K; break; case ASC_X: n = F7_X; break;
    case ASC_C: rch(); stc(rdn()); goto sw;
    case ASC_D:
      rch();
      if (ch == ASC_L) {
        rch(); stw(0); labref(rdn(), lomem - 1);
      } else stw(rdn());
      goto sw;
    case ASC_G:
      rch(); n = rdn();
      if (ch == ASC_L) rch(); else halt(STR_BAD_CODE_AT_P, lomem);
      m[n] = 0; labref(rdn(), n);
      goto sw;
    case ASC_Z:
#ifndef __CC65__
      for (n = 0; n < LABVCOUNT; ++n) if (labv[n] > 0) halt(STR_UNSET_LABEL, n);
#endif
      goto clear;
  }
  rch();
  if (ch == ASC_I) { n |= FI_BIT; rch(); }
  if (ch == ASC_P) { n |= FP_BIT; rch(); }
  if (ch == ASC_G) { rch(); }
  if (ch == ASC_L) {
    rch();
    stw(n | FD_BIT);
    stw(0);
    labref(rdn(), lomem - 1);
  } else {
    short d = rdn();
    if ((d & FN_MASK) == d) {
      stw(n | (d << FN_BITS));
    } else {
      stw(n | FD_BIT);
      stw(d);
    }
  }
  goto sw;
}

fn0(short, interpret) {
  register word w, d, pc, sp;
  register short a, b, *v;
  pc = PROGSTART;
  sp = lomem;
  a = b = 0;
fetch:
  d = (w = m[pc++]) & FD_BIT ? m[pc++] : w >> FN_BITS;
  if (w & FP_BIT) d += sp;
  if (w & FI_BIT) d = m[d];
  switch (w & F7_X) {
    case F0_L: b = a; a = d; goto fetch;
    case F1_S: m[d] = a; goto fetch;
    case F2_A: a += d; goto fetch;
    case F3_J: pc = d; goto fetch;
    case F4_T: if ( a) pc = d; goto fetch;
    case F5_F: if (!a) pc = d; goto fetch;
    case F6_K: d += sp;
      if (a < PROGSTART) {
        v = &m[d + 2];
        switch (a) {
          default: halt(STR_UNKNOWN_CALL, a);
          case K11_SELECTINPUT : cis = *v; goto fetch;
          case K12_SELECTOUTPUT: cos = *v; goto fetch;
          case K13_RDCH: a = rdch(); goto fetch;
          case K14_WRCH: wrch(*v); goto fetch;
          case K16_INPUT: a = cis; goto fetch;
          case K17_OUTPUT: a = cos; goto fetch;
          case K30_STOP: return *v;
          case K31_LEVEL: a = sp; goto fetch;
          case K32_LONGJUMP: sp = v[0]; pc = v[1]; goto fetch;
          case K40_APTOVEC:
            b = d + v[1] + 1;
            m[b] = sp; m[b + 1] = pc; m[b + 2] = d; m[b + 3] = v[1];
            sp = b; pc = v[0];
            goto fetch;
          case K41_FINDOUTPUT: a = findoutput((byte*)&m[*v]); goto fetch;
          case K42_FINDINPUT: a = findinput((byte*)&m[*v]); goto fetch;
          case K46_ENDREAD: endread(); goto fetch;
          case K47_ENDWRITE: endwrite(); goto fetch;
          case K60_WRITES: writes((byte*)&m[*v]); goto fetch;
          case K62_WRITEN: writen(*v); goto fetch;
          case K63_NEWLINE: newline(); goto fetch;
          case K64_NEWPAGE: wrch(ASC_FF); goto fetch;
          case K66_PACKSTRING: a = packstring((short*)&m[v[0]], (byte*)&m[v[1]]); goto fetch;
          case K67_UNPACKSTRING: unpackstring((byte*)&m[v[0]], (short*)&m[v[1]]); goto fetch;
          case K68_WRITED: writed(v[0], v[1]); goto fetch;
          case K70_READN: a = readn(); goto fetch;
          case K75_WRITEHEX: writehex(v[0], v[1]); goto fetch;
          case K77_WRITEOCT: writeoct(v[0], v[1]); goto fetch;
          case K76_WRITEF: writef(v); goto fetch;
          case K85_GETBYTE: a = ((byte*)&m[v[0]])[v[1]]; goto fetch;
          case K86_PUTBYTE: ((byte*)&m[v[0]])[v[1]] = v[2]; goto fetch;
        }
      } else {
        m[d] = sp; m[d + 1] = pc; sp = d; pc = a;
      }
      goto fetch;
    case F7_X:
      switch (d) {
        default: halt(STR_UNKNOWN_EXEC, d);
        case  1: a = m[a]; goto fetch;
        case  2: a = -a; goto fetch;
        case  3: a = ~a; goto fetch;
        case  4: pc = m[sp + 1]; sp = m[sp]; goto fetch;
        case  5: a = b * a; goto fetch;
        case  6: if (a) a = b / a; goto fetch;
        case  7: if (a) a = b % a; goto fetch;
        case  8: a = b + a; goto fetch;
        case  9: a = b - a; goto fetch;
        case 10: a = -(b == a); goto fetch;
        case 11: a = -(b != a); goto fetch;
        case 12: a = -(b < a); goto fetch;
        case 13: a = -(b >= a); goto fetch;
        case 14: a = -(b > a); goto fetch;
        case 15: a = -(b <= a); goto fetch;
        case 16: a = b << a; goto fetch;
        case 17: a = (word)b >> a; goto fetch;
        case 18: a = b & a; goto fetch;
        case 19: a = b | a; goto fetch;
        case 20: a = b ^ a; goto fetch;
        case 21: a = b ^ ~a; goto fetch;
        case 22: return 0;
        case 23:
          v = &m[pc]; b = *v++; pc = *v++;
          for (; b--; v += 2) if (a == v[0]) { pc = v[1]; goto fetch; }
          goto fetch;
      }
  }
  halt(STR_INTCODE_ERROR_AT_PC, pc);
  return ENDSTREAMCH;
}

fn1(short, loadcode, char*, fn) {
  byte s[FILENAME_MAX];
  short f = findinput(bstr(s, fn));
  if (f) {
    cis = f;
    assemble();
    endread();
  }
  return f;
}

fn0(void, init) {
  for (lomem = 0; lomem < PROGSTART; ++lomem) m[lomem] = lomem;
  stw(F0_L | FI_BIT | (K01_START << FN_BITS));
  stw(F6_K | (2 << FN_BITS));
  stw(F7_X | (22 << FN_BITS));
  cis = sysin = STDIN_FILENO + 1;
  cos = sysprint = STDOUT_FILENO + 1;
}

fn1(void, pipeinput, char*, fn) {
  short f = openfile(fn, O_RDONLY);
  if (!f) halt(STR_NO_INPUT, errno);
  cis = sysin = f;
}

fn1(void, pipeoutput, char*, fn) {
  short f = openfile(fn, O_CREAT | O_WRONLY | O_TRUNC);
  if (!f) halt(STR_NO_OUTPUT, errno);
  cos = sysprint = f;
}

#ifdef NO_ARGS
fn0(void, getargs)
{
  char s[FILENAME_MAX], o[FILENAME_MAX];
  do {
    writecstr("ICFILE=");
    if (gets(s) && s[0] && !loadcode(s)) halt(STR_NO_ICFILE, errno);
  } while(s[0]);
  writecstr("INPUT ="); gets(s);
  writecstr("OUTPUT="); gets(o);
  if (s[0]) pipeinput(s);
  if (o[0]) pipeoutput(o);
}

fn0(int, main)
{
  init();
  getargs();
  return interpret();
}
#else

fn2(int, main, int, argc, char**, argv) {
  short i;
  init();
  if (argc < 2) halt(STR_USAGE, 0);
  for (i = 1; i < argc; ++i) {
    if (argv[i][0] == ASC_MINUS) {
      switch (argv[i][1]) {
        case 'i': pipeinput(&argv[i][2]); break;
        case 'o': pipeoutput(&argv[i][2]); break;
        default : halt(STR_INVALID_OPTION, i); break;
      }
    } else if (!loadcode(argv[i])) halt(STR_NO_ICFILE, errno);
  }
  return interpret();
}
#endif
