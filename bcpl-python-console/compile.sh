#!/bin/bash

# BCPL Compiler Script (Python version)
# Compiles and runs a BCPL program using the Python INTCODE interpreter
#
# NOTE: For better performance, use PyPy instead of CPython:
#   PYTHON=pypy3 ./compile.sh test.b

PYTHON=${PYTHON:-python3}

# Concatenate syni and trni (stripping Z from trni)
cat syni > synitrni
tail -n +4 trni >> synitrni

# Compile BCPL to OCODE
echo "Compiling $1 to OCODE..."
$PYTHON icint.py synitrni -i$1

# Compile OCODE to INTCODE
echo "Compiling OCODE to INTCODE..."
$PYTHON icint.py cgi -iOCODE

# Run INTCODE
echo "Running INTCODE..."
$PYTHON icint.py INTCODE
