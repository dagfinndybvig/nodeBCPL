#!/bin/bash

# Concatenate syni and trni (stripping Z from trni)
cat syni > synitrni
tail -n +4 trni >> synitrni

# Compile BCPL to OCODE
echo "Compiling $1 to OCODE..."
node icint.js synitrni -i$1

# Compile OCODE to INTCODE
echo "Compiling OCODE to INTCODE..."
node icint.js cgi -iOCODE

# Run INTCODE
echo "Running INTCODE..."
node icint.js INTCODE
