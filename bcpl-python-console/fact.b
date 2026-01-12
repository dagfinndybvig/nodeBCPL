
GET "LIBHDR"

LET START() = VALOF
$(
    FOR I = 1 TO 6 DO
    $(
        WRITEF("FACTORIAL OF %N IS %N*N", I, FACT(I))
    $)
    RESULTIS 0
$)

AND FACT(N) = N = 0 -> 1, N * FACT(N-1)
