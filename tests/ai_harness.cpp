// Smoke-test the original AI's opening and a normal two-stone turn.
#define main botzone_entry
#include "../FinalVersion.cpp"
#undef main
#include <cassert>

int main() {
    curBotColour=grid_black;
    int result[4]={-1,-1,-1,-1};
    GetOurAnswer(result,1,-1,-1,-1,-1);
    assert(result[0]==7 && result[1]==7 && result[2]==-1 && result[3]==-1);
    assert(ProcStep(7,7,-1,-1,grid_black,false));
    curBotColour=grid_white;
    GetOurAnswer(result,1,7,7,-1,-1);
    assert(result[0]==6 && result[1]==7 && result[2]==7 && result[3]==6);
    assert(ProcStep(6,7,7,6,grid_white,false));
    curBotColour=grid_black;
    GetOurAnswer(result,2,6,7,7,6);
    assert(inMap(result[0],result[1]) && inMap(result[2],result[3]));
    assert(gridInfo[result[0]][result[1]]==0 && gridInfo[result[2]][result[3]]==0);
    assert(result[0]!=result[2] || result[1]!=result[3]);
}
