GET "LIBHDR"

LET START() BE

$( LET C = ?

	UNTIL C='0' DO
		$(
		C:=RDCH()
		IF NOT C='0' WRCH(C)
		$)

	NEWLINE()
$)
