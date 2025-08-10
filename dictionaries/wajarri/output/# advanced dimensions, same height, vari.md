# advanced dimensions, same height, variable width
HTTP GET - 200 -User-Agent: chrome -ip 121
HTTP GET - 200 -User-Agent: chrome2  -ip 432
HTTP GET - 200 -User-Agent: opera-mini-browser  -ip 432

# simple fixed dimensions
HTTP GET - 200 -User-Agent: chrome -ip 121
HTTP GET - 200 -User-Agent: chrome -ip 122

# very simple 
1
2

## as a 3 by 3 grid, basic binary, on or off
. X . 
. X . 
. X .

X X X
. X .
X X X

## as 5 by 5 grid, basic binary, on or off
### 1 (a)
. . X . .
. . X . .
. . X . .
. . X . .
. . X . .

### 2 (b)
X X X X X
. . . X .
. . X . .
. X . . .
X X X X X 

## Union

X X X X X
. . X X .
. . X . .
. X X . .
X X X X X 

## Difference (a - b)

X X . X X
. . . X .
. . . . .
. X . . .
X X . X X 

## Inverse 

X X . X X
. . X X .
. . . . .
. X X . .
X X . X X 






# 3assumptions 
- every image is at the same "zoom"
- width of characters
- using a monospaced font 
- sorted log arguments / consistent field order
- 6(y) x X
- image format 
- math, a lot of fucking math 
  - far from now, transform to the different image codecs
- 


