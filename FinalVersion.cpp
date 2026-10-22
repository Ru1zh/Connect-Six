#include <iostream>
#include <string>
#include <cstdlib>
#include <ctime>
#include <vector>
#include <cmath>

#define GRIDSIZE 15
#define INT_MAX 2147483647
#define judge_black 0
#define judge_white 1
#define grid_blank 0
#define grid_black 1
#define grid_white -1

#define PRIOR 5

#define MineParameterOne 20
#define MineParameterTwo 80
#define MineParameterThree 150
#define MineParameterFour 800
#define MineParameterFive 1000
#define MineParameterSix 60000000

#define EnemyParameterOne 25
#define EnemyParameterTwo 100
#define EnemyParameterThree 180
#define EnemyParameterFour 100000
#define EnemyParameterFive 120000
#define EnemyParameterSix 60000000

using namespace std;

// 棋盘编码：黑方为 1，白方为 -1，空位为 0。
int curBotColour;
int gridInfo[GRIDSIZE][GRIDSIZE] = {0};
int dx[] = {-1, -1, -1, 0, 0, 1, 1, 1};
int dy[] = {-1, 0, 1, -1, 1, -1, 0, 1};

double N = 0;
double C = 2;

inline bool inMap(int x, int y)
{
	if (x < 0 || x >= GRIDSIZE || y < 0 || y >= GRIDSIZE)
		return false;
	return true;
}

// 支持单子与双子落子；check_only 为 true 时只检查合法性。
bool ProcStep(int x0, int y0, int x1, int y1, int grid_color, bool check_only)
{
	if (x1 == -1 || y1 == -1)
	{
		if (!inMap(x0, y0) || gridInfo[x0][y0] != grid_blank)
			return false;
		if (!check_only)
		{
			gridInfo[x0][y0] = grid_color;
		}
		return true;
	}
	else
	{
		if ((!inMap(x0, y0)) || (!inMap(x1, y1)))
			return false;
		if (gridInfo[x0][y0] != grid_blank || gridInfo[x1][y1] != grid_blank)
			return false;
		if (!check_only)
		{
			gridInfo[x0][y0] = grid_color;
			gridInfo[x1][y1] = grid_color;
		}
		return true;
	}
}

void Gridset(int GridBeSet[GRIDSIZE][GRIDSIZE], int GridBeCopy[GRIDSIZE][GRIDSIZE]);

// 标记新落子周围两格内的候选空位。
void isInBattleLand(int x, int y, int validGrid[GRIDSIZE][GRIDSIZE], int TempGrid[GRIDSIZE][GRIDSIZE])
{
	for (int dx = -2; dx <= 2; dx++)
	{
		for (int dy = -2; dy <= 2; dy++)
		{
			int nx = x + dx, ny = y + dy;
			if (inMap(nx, ny) && TempGrid[nx][ny] == grid_blank)
			{
				validGrid[nx][ny] = 1;
			}
		}
	}
}

// 按本回合的两个落点更新局部候选区域。
void isInBattleLand(int x0, int y0, int x1, int y1, int validGrid[GRIDSIZE][GRIDSIZE], int TempGrid[GRIDSIZE][GRIDSIZE])
{
	for (int dx = -2; dx <= 2; dx++)
	{
		for (int dy = -2; dy <= 2; dy++)
		{
			int nx = x0 + dx, ny = y0 + dy;
			if (inMap(nx, ny) && TempGrid[nx][ny] == grid_blank)
			{
				validGrid[nx][ny] = 1;
			}
			nx = x1 + dx, ny = y1 + dy;
			if (inMap(nx, ny) && TempGrid[nx][ny] == grid_blank)
			{
				validGrid[nx][ny] = 1;
			}
		}
	}
}

// 根据整个棋盘重建候选区域；validGrid 由调用方初始化为 0。
void isInBattleLand(int validGrid[GRIDSIZE][GRIDSIZE], int TempGrid[GRIDSIZE][GRIDSIZE])
{

	for (int i = 0; i < GRIDSIZE; i++)
	{
		for (int j = 0; j < GRIDSIZE; j++)
		{
			if (TempGrid[i][j] != grid_blank)
			{
				for (int x = i - 2; x <= i + 2; x++)
				{
					for (int y = j - 2; y <= j + 2; y++)
					{
						if (x < 0)
							continue;
						if (inMap(x, y) && TempGrid[x][y] == grid_blank)
						{
							validGrid[x][y] = 1;
						}
					}
				}
			}
		}
	}
}

// 博弈树节点：保存棋盘、父子关系和局面评分。
class MCTSnode
{
public:

	void CopyTheGridInfo()
	{
		for (int i = 0; i < GRIDSIZE; i++)
		{
			for (int j = 0; j < GRIDSIZE; j++)
			{
				MyGridInfo[i][j] = gridInfo[i][j];
			}
		}
		TurnColor = curBotColour;
	}

public:
	MCTSnode *parent = NULL;
	int MyGridInfo[GRIDSIZE][GRIDSIZE] = {0};
	vector<MCTSnode *> children;
	int value = 0;
	int TurnColor = -curBotColour;
};

// 以下方向判断以已落子的 (x, y) 为起点，检查是否存在至少 n 个同色连子。
bool JudgeHorizon(int x, int y, int color, int n, int Grid[GRIDSIZE][GRIDSIZE])
{
	int i = 1;
	int count = 1;
	while (Grid[x - i][y] == color)
	{
		count++;
		i++;
	}
	i = 1;
	while (Grid[x + i][y] == color)
	{
		count++;
		i++;
	}
	return count >= n;
}

bool JudgeVertical(int x, int y, int color, int n, int Grid[GRIDSIZE][GRIDSIZE])
{
	int i = 1;
	int count = 1;
	while (Grid[x][y - i] == color)
	{
		count++;
		i++;
	}
	i = 1;
	while (Grid[x][y + i] == color)
	{
		count++;
		i++;
	}
	return count >= n;
}

bool JudgeSlopeRight(int x, int y, int color, int n, int Grid[GRIDSIZE][GRIDSIZE])
{
	int i = 1;
	int count = 1;
	while (Grid[x - i][y - i] == color)
	{
		count++;
		i++;
	}
	i = 1;
	while (Grid[x + i][y + i] == color)
	{
		count++;
		i++;
	}
	return count >= n;
}

bool JudgeSlopeLeft(int x, int y, int color, int n, int Grid[GRIDSIZE][GRIDSIZE])
{
	int i = 1;
	int count = 1;
	while (Grid[x + i][y - i] == color)
	{
		count++;
		i++;
	}
	i = 1;
	while (Grid[x - i][y + i] == color)
	{
		count++;
		i++;
	}
	return count >= n;
}

bool JudgeIfNConnect(int x, int y, int color, int n, int Grid[GRIDSIZE][GRIDSIZE])
{
	bool judge1, judge2, judge3, judge4;
	judge1 = JudgeHorizon(x, y, color, n, Grid);
	judge2 = JudgeVertical(x, y, color, n, Grid);
	judge3 = JudgeSlopeRight(x, y, color, n, Grid);
	judge4 = JudgeSlopeLeft(x, y, color, n, Grid);
	return (judge1 || judge2 || judge3 || judge4);
}

// 分方向扫描六格窗口，统计仅含一方棋子和空位的有效路。
void CalculateHorizonRoad(int Grid[GRIDSIZE][GRIDSIZE], int MyColor, int NumberOfRoad[6], int NumberOfEnemyRoad[6])
{
	for (int i = 2; i < GRIDSIZE - 3; i++)
	{
		for (int j = 0; j < GRIDSIZE; j++)
		{
			bool flag = false;
			bool Enter = true;
			int cnt = 0;
			int color = 1;
			for (int k = -2; k < 4; k++)
			{
				if (Grid[i + k][j] != 0 && flag == false)
				{
					color = Grid[i + k][j];
					cnt++;
					flag = true;
					continue;
				}
				if (Grid[i + k][j] != 0 && Grid[i + k][j] != color)
				{
					Enter = false;
					break;
				}
				if (Grid[i + k][j] == color)
					cnt++;
			}

			if (Enter)
			{
				if (MyColor == color)
					NumberOfRoad[cnt]++;
				else
					NumberOfEnemyRoad[cnt]++;
			}
		}
	}
}

void CalculateVerticalRoad(int Grid[GRIDSIZE][GRIDSIZE], int MyColor, int NumberOfRoad[6], int NumberOfEnemyRoad[6])
{
	for (int i = 0; i < GRIDSIZE; i++)
	{
		for (int j = 2; j < GRIDSIZE - 3; j++)
		{

			bool flag = false;
			bool Enter = true;
			int cnt = 0;
			int color = 1;
			for (int k = -2; k < 4; k++)
			{
				if (Grid[i][j + k] != 0 && flag == false)
				{
					color = Grid[i][j + k];
					cnt++;
					flag = true;
					continue;
				}
				if (Grid[i][j + k] != 0 && Grid[i][j + k] != color)
				{
					Enter = false;
					break;
				}
				if (Grid[i][j + k] == color)
					cnt++;
			}

			if (Enter)
			{
				if (MyColor == color)
					NumberOfRoad[cnt]++;
				else
					NumberOfEnemyRoad[cnt]++;
			}
		}
	}
}

void CalculateSlopeLeftRoad(int Grid[GRIDSIZE][GRIDSIZE], int MyColor, int NumberOfRoad[6], int NumberOfEnemyRoad[6])
{
	for (int i = 2; i < GRIDSIZE - 3; i++)
	{
		for (int j = 3; j < GRIDSIZE - 2; j++)
		{

			int cnt = 0;
			int color = 1;
			bool flag = false;
			bool Enter = true;
			for (int k = -2; k < 4; k++)
			{
				if (Grid[i + k][j - k] != 0 && flag == false)
				{
					color = Grid[i + k][j - k];
					cnt++;
					flag = true;
					continue;
				}
				if (Grid[i + k][j - k] != 0 && Grid[i + k][j - k] != color)
				{
					Enter = false;
					break;
				}
				if (Grid[i + k][j - k] == color)
				{
					cnt++;
				}
			}

			if (Enter)
			{
				if (MyColor == color)
				{
					NumberOfRoad[cnt]++;
				}
				else
				{
					NumberOfEnemyRoad[cnt]++;
				}
			}
		}
	}
}

void CalculateSlopeRightRoad(int Grid[GRIDSIZE][GRIDSIZE], int MyColor, int NumberOfRoad[6], int NumberOfEnemyRoad[6])
{
	for (int i = 2; i < GRIDSIZE - 3; i++)
	{
		for (int j = 2; j < GRIDSIZE - 3; j++)
		{

			int cnt = 0;
			int color = 1;
			bool flag = false;
			bool Enter = true;
			for (int k = -2; k < 4; k++)
			{
				if (Grid[i + k][j + k] != 0 && flag == false)
				{
					color = Grid[i + k][j + k];
					cnt++;
					flag = true;
					continue;
				}
				if (Grid[i + k][j + k] != 0 && Grid[i + k][j + k] != color)
				{
					Enter = false;
					break;
				}
				if (Grid[i + k][j + k] == color)
				{
					cnt++;
				}
			}

			if (Enter)
			{
				if (MyColor == color)
				{
					NumberOfRoad[cnt]++;
				}
				else
				{
					NumberOfEnemyRoad[cnt]++;
				}
			}
		}
	}
}

// 按双方有效路数量及攻防权重估值；分数越高，局面对 MyColor 越有利。
long long JudgeFunction(int JudgeGridInfo[GRIDSIZE][GRIDSIZE], int MyColor)
{
	int ScoreOfRoadMine[7] = {0, MineParameterOne, MineParameterTwo, MineParameterThree, MineParameterFour, MineParameterFive, MineParameterSix};
	int ScoreOfRoadYours[7] = {0, EnemyParameterOne, EnemyParameterTwo, EnemyParameterThree, EnemyParameterFour, EnemyParameterFive, EnemyParameterSix};

	int NumberOfRoad[7] = {0};
	int NumberOfEnemyRoad[7] = {0};
	long long Score = 0;
	CalculateHorizonRoad(JudgeGridInfo, MyColor, NumberOfRoad, NumberOfEnemyRoad);
	CalculateVerticalRoad(JudgeGridInfo, MyColor, NumberOfRoad, NumberOfEnemyRoad);
	CalculateSlopeLeftRoad(JudgeGridInfo, MyColor, NumberOfRoad, NumberOfEnemyRoad);
	CalculateSlopeRightRoad(JudgeGridInfo, MyColor, NumberOfRoad, NumberOfEnemyRoad);
	for (int i = 1; i < 7; i++)
		Score += ScoreOfRoadMine[i] * NumberOfRoad[i] - ScoreOfRoadYours[i] * NumberOfEnemyRoad[i];
	return Score;
}

int JudgeNumOfElement()
{
	int num = 0;
	for (int i = 0; i < GRIDSIZE; i++)
	{
		for (int j = 0; j < GRIDSIZE; j++)
		{
			if (gridInfo[i][j] != 0)
			{
				num++;
			}
		}
	}
	return num;
}

void Gridset(int GridBeSet[GRIDSIZE][GRIDSIZE], int GridBeCopy[GRIDSIZE][GRIDSIZE])
{
	for (int i = 0; i < GRIDSIZE; i++)
	{
		for (int j = 0; j < GRIDSIZE; j++)
		{
			GridBeSet[i][j] = GridBeCopy[i][j];
		}
	}
}

struct locate
{
	int x;
	int y;
};

int getAllLocation(int validGrid[GRIDSIZE][GRIDSIZE], locate array[])
{
	int index = 0;
	for (int i = 0; i < GRIDSIZE; i++)
	{
		for (int j = 0; j < GRIDSIZE; j++)
		{
			if (validGrid[i][j])
			{
				array[index].x = i;
				array[index].y = j;
				index++;
			}
		}
	}
	return index;
}

// 同步后移评分和节点数组，为新候选留位，不丢弃已有候选。
void backmoveWithoutDrop(int array[], MCTSnode *PriorArray[], int length, int start)
{
	if (start > length - 1)
	{
		return;
	}
	delete PriorArray[length];
	for (int i = length - 1; i >= start; i--)
	{
		array[i + 1] = array[i];
		PriorArray[i + 1] = PriorArray[i];
	}
	PriorArray[start] = new MCTSnode;
}

// 同步后移评分和节点数组，并淘汰末位候选。
void backmoveWithDrop(int array[], MCTSnode *PriorArray[], int length, int start)
{
	if (start > length - 1)
	{
		return;
	}
	delete PriorArray[length - 1];
	for (int i = length - 2; i >= start; i--)
	{
		array[i + 1] = array[i];
		PriorArray[i + 1] = PriorArray[i];
	}
	PriorArray[start] = new MCTSnode;
}

void InitialMCTSArray(MCTSnode *PriorArray[20])
{
	for (int i = 0; i < 20; i++)
	{
		PriorArray[i] = new MCTSnode;
	}
}

void EndMCTSArray(MCTSnode *PriorArray[20])
{
	for (int i = 0; i < 20; i++)
	{
		delete PriorArray[i];
	}
}

// 比较落子前后的棋盘，提取本回合两个落点的坐标。
void CompareWhereLocate(int gridBefore[GRIDSIZE][GRIDSIZE], int gridNext[GRIDSIZE][GRIDSIZE], int &x0, int &y0, int &x1, int &y1)
{
	int time = 1;

	for (int i = 0; i < GRIDSIZE; i++)
	{
		for (int j = 0; j < GRIDSIZE; j++)
		{
			if (gridBefore[i][j] == 0 && gridNext[i][j] != 0 && time == 1)
			{
				x0 = i;
				y0 = j;
				time++;
				continue;
			}
			if (gridBefore[i][j] == 0 && gridNext[i][j] != 0 && time == 2)
			{
				x1 = i;
				y1 = j;
				return;
			}
		}
	}
}

// 枚举候选两子组合并保留高分后继；prior 以引用返回实际保留数量。
bool buildTree(MCTSnode *&root, int result[], int NowGrid[GRIDSIZE][GRIDSIZE], int WhoseColor, int &prior)
{

	int validGrid[GRIDSIZE][GRIDSIZE] = {0};
	int TempGrid[GRIDSIZE][GRIDSIZE] = {0};
	Gridset(TempGrid, NowGrid);
	isInBattleLand(validGrid, TempGrid);
	locate array[300];
	int length = getAllLocation(validGrid, array);

	MCTSnode *PriorArray[20];
	InitialMCTSArray(PriorArray);
	int GradeArray[20] = {0};

	int GradeArrayLength = 0;
	for (int i = 0; i < length; i++)
	{
		for (int j = i + 1; j < length; j++)
		{

			Gridset(TempGrid, NowGrid);
			TempGrid[array[i].x][array[i].y] = WhoseColor;
			TempGrid[array[j].x][array[j].y] = WhoseColor;
			long long grade = JudgeFunction(TempGrid, WhoseColor);

			if (GradeArrayLength < prior)
			{
				if (GradeArrayLength == 0)
				{
					GradeArray[0] = grade;
					GradeArrayLength++;

					Gridset(PriorArray[0]->MyGridInfo, TempGrid);
					continue;
				}
				for (int k = 0; k < GradeArrayLength; k++)
				{
					if (k == GradeArrayLength - 1 && GradeArray[k] >= grade)
					{
						backmoveWithoutDrop(GradeArray, PriorArray, GradeArrayLength, k);
						GradeArray[k] = grade;
						GradeArrayLength++;

						Gridset(PriorArray[k]->MyGridInfo, TempGrid);
						break;
					}
					if (GradeArray[k] < grade)
					{
						backmoveWithoutDrop(GradeArray, PriorArray, GradeArrayLength, k);
						GradeArray[k] = grade;
						GradeArrayLength++;

						Gridset(PriorArray[k]->MyGridInfo, TempGrid);
						break;
					}
				}
			}
			else
			{
				if (GradeArray[prior - 1] < grade)
				{
					for (int k = 0; k < GradeArrayLength; k++)
					{
						if (GradeArray[k] < grade)
						{
							backmoveWithDrop(GradeArray, PriorArray, GradeArrayLength, k);
							GradeArray[k] = grade;
							Gridset(PriorArray[k]->MyGridInfo, TempGrid);
							break;
						}
					}
				}
			}
		}
	}

	prior = min(prior, GradeArrayLength);

	for (int i = 0; i < prior; i++)
	{
		PriorArray[i]->parent = root;
		PriorArray[i]->value = GradeArray[i];
		root->children.push_back(PriorArray[i]);
	}
	return false;
}

// 根据当前棋盘生成落子；result 依次保存两个落点的 x、y 坐标。
void GetOurAnswer(int result[], int turnID, int x0, int y0, int x1, int y1)
{

	int start = 0;
	int current = 0;
	start = current = clock();

	if (x0 == -1)
	{
		result[0] = 7;
		result[1] = 7;
		result[2] = -1;
		result[3] = -1;
		return;
	}
	if (x1 == -1)
	{
		result[0] = x0 - 1;
		result[1] = y0;
		result[2] = x0;
		result[3] = y0 - 1;
		return;
	}

	MCTSnode *root = new MCTSnode;
	root->CopyTheGridInfo();

	int prior = PRIOR;

	bool IfReturn = buildTree(root, result, root->MyGridInfo, curBotColour, prior);
	if (IfReturn)
	{
		return;
	}

	for (int i = 0; i < prior; i++)
	{
		buildTree(root->children[i], result, root->children[i]->MyGridInfo, -curBotColour, prior);
	}

	// 当相邻候选评分差超过阈值时，截断后续分支。
	int num = 1;
	for (int i = 0; i < prior; i++)
	{
		if (i == prior - 1)
			break;
		if (abs(root->children[i]->value - root->children[i + 1]->value) > 80000)
		{
			break;
		}
		num++;
	}

	// 将对手后继评分求和取负，回传至对应的己方候选。
	for (int k = 0; k < num; k++)
	{
		MCTSnode *p = root->children[k];
		int total = 0;
		for (int i = 0; i < prior; i++)
		{
			total += p->children[i]->value;
		}
		p->value = -total;
	}

	// 在保留的己方候选中选择回传评分最高的落子。
	int ENDmax = root->children[0]->value;
	int index = 0;
	for (int i = 1; i < num; i++)
	{
		if (root->children[i]->value > ENDmax)
		{
			ENDmax = root->children[i]->value;
			index = i;
		}
	}

	CompareWhereLocate(root->MyGridInfo, root->children[index]->MyGridInfo, result[0], result[1], result[2], result[3]);

	return;
}

int main()
{

	srand((unsigned int)time(NULL));
	int x0 = 0, y0 = 0, x1 = 0, y1 = 0;

	// 读取对局历史并恢复当前棋盘状态。
	int turnID;
	cin >> turnID;
	curBotColour = grid_white;
	for (int i = 0; i < turnID; i++)
	{

		cin >> x0 >> y0 >> x1 >> y1;
		if (x0 == -1)
			curBotColour = grid_black;
		if (x0 >= 0)
			ProcStep(x0, y0, x1, y1, -curBotColour, false);
		if (i < turnID - 1)
		{
			cin >> x0 >> y0 >> x1 >> y1;
			if (x0 >= 0)
				ProcStep(x0, y0, x1, y1, curBotColour, false);
		}
	}

	int startX = 0, startY = 0, resultX = 0, resultY = 0;
	int result[4] = {0};
	GetOurAnswer(result, turnID, x0, y0, x1, y1);
	startX = result[0];
	startY = result[1];
	resultX = result[2];
	resultY = result[3];

	// 向对弈平台输出两个落点的四个坐标值。
	cout << startX << ' ' << startY << ' ' << resultX << ' ' << resultY << endl;
	return 0;
}
